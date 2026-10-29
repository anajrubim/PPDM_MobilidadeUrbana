import type { Logger } from 'pino';
import type { Queryable } from '../../db/pool.js';
import { notify } from '../notifications/service.js';
import type { PushSender } from '../notifications/push.js';
import type { NetworkCache } from '../transit/network.js';
import { formatHHMM, parseHHMM } from '../transit/schedule.js';
import type { ProximityRow } from './proximity-routes.js';
import type { ServiceAlerts } from './service-alerts.js';
import { clockFor, predictedArrivals, vehiclesOfLine } from './simulation.js';

/** A partir de quantos minutos de atraso o usuário é avisado (US17). */
export const DELAY_THRESHOLD_MIN = 5;
/** Avisos de itinerário são enviados até 12 h antes de começarem. */
const ALERT_LEAD_MS = 12 * 60 * 60 * 1000;

const KIND_LABEL = { delay: 'Atraso', detour: 'Mudança de itinerário', suspension: 'Linha suspensa' } as const;

/** Dentro da janela [início, fim) do alerta? Janela que vira a meia-noite (22:00–02:00) também vale. */
export function inWindow(nowMin: number, start: string | null, end: string | null): boolean {
  if (!start || !end) return true;
  const s = parseHHMM(start);
  const e = parseHHMM(end);
  return s < e ? nowMin >= s && nowMin < e : nowMin >= s || nowMin < e;
}

export interface TickResult {
  serviceAlerts: number;
  delays: number;
  proximity: number;
}

/**
 * Verifica a rede e gera notificações: avisos de serviço e atrasos das linhas favoritas (US17) e ônibus chegando
 * nos pontos dos alertas de proximidade (US18). Roda a cada MONITOR_INTERVAL_S no servidor; nos testes, `tick()` direto.
 * Toda notificação tem dedupeKey: rodar de novo não repete aviso.
 */
export class Monitor {
  private running: Promise<TickResult> | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly db: Queryable,
    private readonly cache: NetworkCache,
    private readonly alerts: ServiceAlerts,
    private readonly push: PushSender,
    private readonly clock: () => Date,
    private readonly logger?: Logger,
  ) {}

  start(intervalS: number): void {
    if (this.timer || intervalS <= 0) return;
    const run = () => {
      this.tick().catch((err: unknown) => this.logger?.error({ err }, 'monitor: falha na verificação'));
    };
    // Primeira verificação logo depois de subir (não espera o intervalo inteiro)
    setTimeout(run, 2000).unref();
    this.timer = setInterval(run, intervalS * 1000);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Uma verificação por vez: chamadas sobrepostas reaproveitam a que está em andamento. */
  tick(): Promise<TickResult> {
    if (!this.running) {
      this.running = this.run().finally(() => {
        this.running = null;
      });
    }
    return this.running;
  }

  private async run(): Promise<TickResult> {
    const now = this.clock();
    const result: TickResult = { serviceAlerts: 0, delays: 0, proximity: 0 };
    const net = await this.cache.get();
    const c = clockFor(now);
    const extra = await this.alerts.extraDelay(now);

    // ---------- Avisos de serviço (mudança de itinerário, atraso anunciado, suspensão) ----------
    const upcoming = (await this.alerts.upcoming(now)).filter((a) => a.startsAt.getTime() - now.getTime() <= ALERT_LEAD_MS);
    for (const a of upcoming) {
      const line = net.lineById.get(a.lineId);
      if (!line) continue;
      const { rows } = await this.db.query<{ user_id: string }>(
        `SELECT f.user_id FROM favorites f JOIN users u ON u.id = f.user_id
          WHERE f.line_id = $1 AND u.notify_service_alerts`,
        [a.lineId],
      );
      for (const { user_id } of rows) {
        const created = await notify(this.db, this.push, {
          userId: user_id,
          type: 'service_alert',
          title: `${KIND_LABEL[a.kind]} · Linha ${line.code}`,
          body: `${a.title}. ${a.message}`,
          lineId: line.id,
          data: { alertId: a.id, kind: a.kind, startsAt: a.startsAt.toISOString(), endsAt: a.endsAt.toISOString() },
          dedupeKey: `alert:${a.id}`,
          at: now,
        });
        if (created) result.serviceAlerts++;
      }
    }

    // ---------- Atrasos nas linhas favoritas ----------
    const favs = await this.db.query<{ line_id: number; users: string[] }>(
      `SELECT f.line_id, array_agg(f.user_id) AS users FROM favorites f JOIN users u ON u.id = f.user_id
        WHERE u.notify_delays GROUP BY f.line_id`,
    );
    for (const { line_id, users } of favs.rows) {
      const line = net.lineById.get(line_id);
      if (!line) continue;
      const worst = vehiclesOfLine(net, line, c, extra)
        .filter((v) => v.delayMin >= DELAY_THRESHOLD_MIN)
        .sort((a, b) => b.delayMin - a.delayMin)[0];
      if (!worst) continue;
      const hour = Math.floor(c.nowMin / 60);
      for (const userId of users) {
        const created = await notify(this.db, this.push, {
          userId,
          type: 'delay',
          title: `Linha ${line.code} atrasada`,
          body:
            `O ônibus das ${worst.departedAt} está com cerca de ${worst.delayMin} min de atraso` +
            (worst.nextStop ? `, chegando em ${worst.nextStop.name}.` : '.'),
          lineId: line.id,
          stopId: worst.nextStop?.id ?? null,
          data: { vehicleId: worst.id, delayMin: worst.delayMin },
          // No máximo um aviso de atraso por linha a cada hora
          dedupeKey: `delay:${line.id}:${c.today}:${hour}`,
          at: now,
        });
        if (created) result.delays++;
      }
    }

    // ---------- Alertas de proximidade (US18) ----------
    const prox = await this.db.query<ProximityRow>(
      `SELECT a.* FROM proximity_alerts a JOIN users u ON u.id = a.user_id WHERE a.active AND u.notify_proximity`,
    );
    for (const a of prox.rows) {
      if (!inWindow(c.nowMin, a.window_start, a.window_end)) continue;
      const line = net.lineById.get(a.line_id);
      const stop = net.stops.get(a.stop_id);
      if (!line || !stop) continue;
      const next = predictedArrivals(line, stop.id, c, 1, extra)[0];
      if (!next || next.inMin > a.minutes_before) continue;
      const created = await notify(this.db, this.push, {
        userId: a.user_id,
        type: 'proximity',
        title: `Linha ${line.code} chegando`,
        body:
          next.inMin <= 0
            ? `O ônibus está chegando agora em ${stop.name}.`
            : `O ônibus chega em ${next.inMin} min em ${stop.name} (previsto ${next.at}).`,
        lineId: line.id,
        stopId: stop.id,
        data: { alertId: a.id, tripId: next.tripId, inMin: next.inMin, at: next.at },
        dedupeKey: `prox:${a.id}:${next.tripId}`,
        at: now,
      });
      if (created) result.proximity++;
    }
    // US29 — localização é dado pessoal: some do banco 24 h depois que o compartilhamento termina
    await this.db.query(
      `UPDATE location_shares SET lat = NULL, lng = NULL WHERE lat IS NOT NULL AND (stopped_at IS NOT NULL OR expires_at <= $1)`,
      [now],
    );
    await this.db.query(`DELETE FROM location_shares WHERE COALESCE(stopped_at, expires_at) < $1::timestamptz - interval '24 hours'`, [now]);
    if (result.serviceAlerts + result.delays + result.proximity > 0) {
      this.logger?.debug({ ...result, at: formatHHMM(c.nowMin) }, 'monitor: notificações geradas');
    }
    return result;
  }
}
