import type { Queryable } from '../../db/pool.js';
import type { ExtraDelay } from './simulation.js';

export type AlertKind = 'delay' | 'detour' | 'suspension';

export interface ServiceAlert {
  id: number;
  lineId: number;
  kind: AlertKind;
  title: string;
  message: string;
  extraDelayMin: number;
  startsAt: Date;
  endsAt: Date;
}

interface Row {
  id: number;
  line_id: number;
  kind: AlertKind;
  title: string;
  message: string;
  extra_delay_min: number;
  starts_at: Date;
  ends_at: Date;
}

const toAlert = (r: Row): ServiceAlert => ({
  id: r.id,
  lineId: r.line_id,
  kind: r.kind,
  title: r.title,
  message: r.message,
  extraDelayMin: r.extra_delay_min,
  startsAt: r.starts_at,
  endsAt: r.ends_at,
});

export const alertDto = (a: ServiceAlert, now: Date) => ({
  id: a.id,
  lineId: a.lineId,
  kind: a.kind,
  title: a.title,
  message: a.message,
  extraDelayMin: a.extraDelayMin,
  startsAt: a.startsAt.toISOString(),
  endsAt: a.endsAt.toISOString(),
  active: a.startsAt <= now && now < a.endsAt,
});

/** Avisos que ainda não terminaram (ativos ou programados para os próximos 7 dias). Cache curto: a tabela muda pouco. */
export class ServiceAlerts {
  private cached: { at: number; list: Promise<ServiceAlert[]> } | null = null;
  constructor(
    private readonly db: Queryable,
    private readonly ttlMs = 10_000,
  ) {}

  async upcoming(now: Date): Promise<ServiceAlert[]> {
    const t = now.getTime();
    // Cache pela hora do relógio da aplicação (nos testes o relógio é fixo e muda entre casos)
    if (!this.cached || Math.abs(t - this.cached.at) > this.ttlMs) {
      const list = this.db
        .query<Row>(
          `SELECT * FROM service_alerts
            WHERE ends_at > $1 AND starts_at < $1::timestamptz + interval '7 days'
            ORDER BY starts_at`,
          [now],
        )
        .then((r) => r.rows.map(toAlert));
      this.cached = { at: t, list };
      list.catch(() => {
        if (this.cached?.list === list) this.cached = null;
      });
    }
    return this.cached.list;
  }

  async active(now: Date): Promise<ServiceAlert[]> {
    return (await this.upcoming(now)).filter((a) => a.startsAt <= now && now < a.endsAt);
  }

  /** Atraso extra (maior aviso de atraso ativo) por linha, usado nas previsões. */
  async extraDelay(now: Date): Promise<ExtraDelay> {
    const map: ExtraDelay = new Map();
    for (const a of await this.active(now)) {
      if (a.extraDelayMin > (map.get(a.lineId) ?? 0)) map.set(a.lineId, a.extraDelayMin);
    }
    return map;
  }

  invalidate(): void {
    this.cached = null;
  }
}

export async function insertServiceAlert(
  db: Queryable,
  a: { lineId: number; kind: AlertKind; title: string; message: string; extraDelayMin?: number; startsAt: Date; endsAt: Date },
): Promise<ServiceAlert> {
  const { rows } = await db.query<Row>(
    `INSERT INTO service_alerts (line_id, kind, title, message, extra_delay_min, starts_at, ends_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [a.lineId, a.kind, a.title, a.message, a.extraDelayMin ?? 0, a.startsAt, a.endsAt],
  );
  return toAlert(rows[0]!);
}
