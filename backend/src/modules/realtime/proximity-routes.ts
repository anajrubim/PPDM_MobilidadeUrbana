import { Router } from 'express';
import { z } from 'zod';
import type { Deps } from '../../app.js';
import { currentUser } from '../../lib/auth.js';
import { AppError, badRequest, notFound } from '../../lib/errors.js';
import { dbId, parse } from '../../lib/http.js';
import type { NetworkCache } from '../transit/network.js';
import type { Services } from './services.js';
import { clockFor, predictedArrivals } from './simulation.js';

const hhmm = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, 'Use o formato HH:MM');
export const MAX_ALERTS_PER_USER = 20;

export interface ProximityRow {
  id: string;
  user_id: string;
  line_id: number;
  stop_id: number;
  minutes_before: number;
  window_start: string | null;
  window_end: string | null;
  active: boolean;
  created_at: Date;
}

/** US18 — alertas de proximidade: "me avise quando o ônibus estiver a N minutos do ponto". Montado em /me. */
export function proximityRoutes(deps: Deps, cache: NetworkCache, services: Services): Router {
  const { db, clock } = deps;
  const r = Router();

  const dto = async (rows: ProximityRow[]) => {
    const net = await cache.get();
    const now = clock();
    const c = clockFor(now);
    const extra = await services.alerts.extraDelay(now);
    return rows.flatMap((a) => {
      const line = net.lineById.get(a.line_id);
      const stop = net.stops.get(a.stop_id);
      if (!line || !stop) return [];
      const next = predictedArrivals(line, stop.id, c, 1, extra)[0] ?? null;
      return [
        {
          id: a.id,
          line: { id: line.id, code: line.code, name: line.name, color: line.color },
          stop: { id: stop.id, name: stop.name },
          minutesBefore: a.minutes_before,
          windowStart: a.window_start,
          windowEnd: a.window_end,
          active: a.active,
          nextArrival: next,
          createdAt: a.created_at.toISOString(),
        },
      ];
    });
  };

  const validateLineStop = async (lineId: number, stopId: number) => {
    const net = await cache.get();
    const line = net.lineById.get(lineId);
    if (!line) throw notFound('Linha');
    if (line.status !== 'active') throw new AppError(409, 'line_inactive', 'Esta linha está desativada');
    if (!line.stops.some((s) => s.stopId === stopId)) throw badRequest('Esta linha não passa nessa parada');
  };

  const windowSchema = {
    windowStart: hhmm.nullable().optional(),
    windowEnd: hhmm.nullable().optional(),
  };
  const checkWindow = (b: { windowStart?: string | null; windowEnd?: string | null }) => {
    if (!!b.windowStart !== !!b.windowEnd) throw badRequest('Informe o início e o fim do horário, ou nenhum dos dois');
    if (b.windowStart && b.windowStart === b.windowEnd) throw badRequest('O início e o fim do horário precisam ser diferentes');
  };

  r.get('/alerts', async (req, res) => {
    const { rows } = await db.query<ProximityRow>('SELECT * FROM proximity_alerts WHERE user_id = $1 ORDER BY created_at', [
      currentUser(req).id,
    ]);
    res.json({ data: await dto(rows) });
  });

  // Cria (ou atualiza, se já existe para a mesma linha e parada)
  r.post('/alerts', async (req, res) => {
    const b = parse(
      z.object({ lineId: dbId, stopId: dbId, minutesBefore: z.number().int().min(1).max(30).default(5), ...windowSchema }),
      req.body,
    );
    checkWindow(b);
    await validateLineStop(b.lineId, b.stopId);
    const userId = currentUser(req).id;
    const { rows: count } = await db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM proximity_alerts WHERE user_id = $1 AND NOT (line_id = $2 AND stop_id = $3)',
      [userId, b.lineId, b.stopId],
    );
    if (count[0]!.n >= MAX_ALERTS_PER_USER) {
      throw new AppError(409, 'too_many_alerts', `Você pode ter até ${MAX_ALERTS_PER_USER} alertas. Apague algum para criar outro.`);
    }
    const { rows } = await db.query<ProximityRow>(
      `INSERT INTO proximity_alerts (user_id, line_id, stop_id, minutes_before, window_start, window_end)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, line_id, stop_id) DO UPDATE
         SET minutes_before = EXCLUDED.minutes_before, window_start = EXCLUDED.window_start,
             window_end = EXCLUDED.window_end, active = true
       RETURNING *, (xmax = 0) AS inserted`,
      [userId, b.lineId, b.stopId, b.minutesBefore, b.windowStart ?? null, b.windowEnd ?? null],
    );
    const row = rows[0] as ProximityRow & { inserted: boolean };
    res.status(row.inserted ? 201 : 200).json({ data: (await dto([row]))[0] });
  });

  r.patch('/alerts/:id', async (req, res) => {
    const id = parse(z.uuid('Id inválido'), req.params.id);
    const b = parse(
      z.object({ minutesBefore: z.number().int().min(1).max(30).optional(), active: z.boolean().optional(), ...windowSchema }).strict(),
      req.body,
    );
    const { rows: cur } = await db.query<ProximityRow>('SELECT * FROM proximity_alerts WHERE id = $1 AND user_id = $2', [
      id,
      currentUser(req).id,
    ]);
    const a = cur[0];
    if (!a) throw notFound('Alerta');
    const windowStart = b.windowStart !== undefined ? b.windowStart : a.window_start;
    const windowEnd = b.windowEnd !== undefined ? b.windowEnd : a.window_end;
    checkWindow({ windowStart, windowEnd });
    const { rows } = await db.query<ProximityRow>(
      `UPDATE proximity_alerts SET minutes_before = $2, active = $3, window_start = $4, window_end = $5
        WHERE id = $1 RETURNING *`,
      [id, b.minutesBefore ?? a.minutes_before, b.active ?? a.active, windowStart, windowEnd],
    );
    res.json({ data: (await dto(rows))[0] });
  });

  r.delete('/alerts/:id', async (req, res) => {
    const { rowCount } = await db.query('DELETE FROM proximity_alerts WHERE id = $1 AND user_id = $2', [
      parse(z.uuid('Id inválido'), req.params.id),
      currentUser(req).id,
    ]);
    if (!rowCount) throw notFound('Alerta');
    res.status(204).end();
  });

  return r;
}
