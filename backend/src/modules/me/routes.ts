import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import type { Deps } from '../../app.js';
import { currentUser } from '../../lib/auth.js';
import { AppError, badRequest, notFound } from '../../lib/errors.js';
import { haversine, polylineLength, type LatLng } from '../../lib/geo.js';
import { dbId, idParam, parse, personName } from '../../lib/http.js';
import { hashPassword, passwordSchema, verifyPassword } from '../../lib/password.js';
import { invalidateResetLinks, sessionFor } from '../auth/routes.js';
import { findUserById, toPublicUser, type UserRow } from '../auth/user-repo.js';
import { ratingSummaries } from '../community/ratings.js';
import { alertDto } from '../realtime/service-alerts.js';
import type { Services } from '../realtime/services.js';
import { clockFor, predictedArrivals } from '../realtime/simulation.js';
import type { Network, NetworkCache } from '../transit/network.js';
import { lineSummary } from '../transit/routes.js';
import { isOperating } from '../transit/schedule.js';

export interface TripLeg {
  lineId: number;
  lineCode: string;
  originStopId: number;
  destStopId: number;
  originLabel: string;
  destLabel: string;
  durationMin: number;
  distanceM: number;
}

interface TripRow {
  id: string;
  kind: 'planned' | 'completed';
  line_id: number | null;
  line_code: string;
  origin_label: string;
  dest_label: string;
  duration_min: number;
  distance_m: number;
  legs: TripLeg[];
  transfers: number;
  walk_min: number;
  completed_at: Date | null;
  created_at: Date;
}

const tripDto = (t: TripRow) => ({
  id: t.id,
  kind: t.kind,
  lineId: t.line_id,
  lineCode: t.line_code,
  originLabel: t.origin_label,
  destLabel: t.dest_label,
  durationMin: t.duration_min,
  distanceM: t.distance_m,
  walkMin: t.walk_min,
  transfers: t.transfers,
  legs: t.legs,
  completedAt: t.completed_at?.toISOString() ?? null,
  createdAt: t.created_at.toISOString(),
});

const legOf = (seg: ReturnType<typeof tripSegment>): TripLeg => ({
  lineId: seg.line.id,
  lineCode: seg.line.code,
  originStopId: seg.origin.id,
  destStopId: seg.dest.id,
  originLabel: seg.origin.name,
  destLabel: seg.dest.name,
  durationMin: seg.durationMin,
  distanceM: seg.distanceM,
});

/** Teto do histórico por conta (antiabuso: o histórico alimenta o resumo do dashboard). */
export const MAX_TRIPS_PER_USER = 5000;

/** Trecho percorrido entre duas paradas da linha (distância pelo trajeto e minutos pela programação). */
export function tripSegment(net: Network, lineId: number, originStopId: number, destStopId: number) {
  const line = net.lineById.get(lineId);
  if (!line) throw notFound('Linha');
  if (line.status !== 'active') throw new AppError(409, 'line_inactive', 'Esta linha está desativada');
  const from = line.stops.findIndex((s) => s.stopId === originStopId);
  // Em linha circular a parada pode repetir: o destino é a primeira passagem depois da origem
  const to = from < 0 ? -1 : line.stops.findIndex((s, i) => i > from && s.stopId === destStopId);
  if (from < 0 || to < 0) throw badRequest('As paradas precisam ser da linha, com o desembarque depois do embarque');
  const pts: LatLng[] = line.stops.slice(from, to + 1).map((ls) => {
    const s = net.stops.get(ls.stopId)!;
    return [s.lat, s.lng];
  });
  return {
    line,
    origin: net.stops.get(originStopId)!,
    dest: net.stops.get(destStopId)!,
    durationMin: line.stops[to]!.offsetMin - line.stops[from]!.offsetMin,
    distanceM: Math.round(polylineLength(pts)),
  };
}

/** Rotas da conta logada: perfil (US04), favoritos (US11), viagens e dashboard (US12). */
export function meRoutes(deps: Deps, cache: NetworkCache, services: Services): Router {
  const { db, config, clock } = deps;
  const r = Router();

  // Rotas que conferem a senha atual: limita força bruta a partir de um token roubado
  const sensitiveLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => config.NODE_ENV === 'test',
    keyGenerator: (req) => req.user?.id ?? (req.ip ? ipKeyGenerator(req.ip) : 'anon'),
    handler: (_req, res) => res.status(429).json({ error: { code: 'rate_limited', message: 'Muitas tentativas. Tente mais tarde.' } }),
  });

  const load = async (id: string): Promise<UserRow> => {
    const u = await findUserById(db, id);
    if (!u) throw notFound('Usuário');
    return u;
  };

  // ---------- Perfil (US04) ----------
  r.get('/', async (req, res) => {
    res.json({ data: toPublicUser(await load(currentUser(req).id)) });
  });

  r.patch('/', async (req, res) => {
    const body = parse(z.object({ name: personName }), req.body);
    const { rows } = await db.query<UserRow>('UPDATE users SET name = $1, updated_at = now() WHERE id = $2 RETURNING *', [
      body.name,
      currentUser(req).id,
    ]);
    res.json({ data: toPublicUser(rows[0]!) });
  });

  r.post('/password', sensitiveLimiter, async (req, res) => {
    const body = parse(
      z.object({ currentPassword: z.string().min(1, 'Informe a senha atual').max(128), newPassword: passwordSchema }),
      req.body,
    );
    const user = await load(currentUser(req).id);
    // 400 e não 401: a sessão continua válida, só a senha digitada está errada (o app não deve deslogar)
    if (!(await verifyPassword(body.currentPassword, user.password_hash))) {
      throw new AppError(400, 'wrong_password', 'Senha atual incorreta', [{ field: 'currentPassword', message: 'Senha atual incorreta' }]);
    }
    const { rows } = await db.query<UserRow>(
      `UPDATE users SET password_hash = $1, token_version = token_version + 1, updated_at = now()
        WHERE id = $2 RETURNING *`,
      [await hashPassword(body.newPassword), user.id],
    );
    // Um link de "esqueci minha senha" pedido antes não pode desfazer a troca
    await invalidateResetLinks(db, user.id, clock());
    // Sessões antigas ficam inválidas; esta recebe um token novo
    res.json({ data: sessionFor(config.JWT_SECRET, rows[0]!) });
  });

  // ---------- Favoritos (US11) ----------
  const listFavorites = async (userId: string) => {
    const net = await cache.get();
    const [{ rows }, ratings] = await Promise.all([
      db.query<{ line_id: number }>('SELECT line_id FROM favorites WHERE user_id = $1 ORDER BY created_at', [userId]),
      ratingSummaries(db),
    ]);
    const ids = new Set(rows.map((f) => f.line_id));
    return rows.flatMap((f) => {
      const line = net.lineById.get(f.line_id);
      return line ? [lineSummary(line, ids, ratings)] : [];
    });
  };

  r.get('/favorites', async (req, res) => {
    res.json({ data: await listFavorites(currentUser(req).id) });
  });

  r.put('/favorites/:lineId', async (req, res) => {
    const lineId = parse(idParam, req.params.lineId);
    const net = await cache.get();
    const line = net.lineById.get(lineId);
    if (!line) throw notFound('Linha');
    if (line.status !== 'active') throw new AppError(409, 'line_inactive', 'Esta linha está desativada e não pode ser favoritada');
    await db.query('INSERT INTO favorites (user_id, line_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [currentUser(req).id, lineId]);
    res.json({ data: await listFavorites(currentUser(req).id) });
  });

  r.delete('/favorites/:lineId', async (req, res) => {
    await db.query('DELETE FROM favorites WHERE user_id = $1 AND line_id = $2', [currentUser(req).id, parse(idParam, req.params.lineId)]);
    res.status(204).end();
  });

  // ---------- Viagens: registro (US12) e histórico de planejadas/realizadas (US19) ----------
  r.get('/trips', async (req, res) => {
    const q = parse(
      z.object({
        limit: z.coerce.number().int().min(1).max(100).default(20),
        kind: z.enum(['planned', 'completed']).optional(),
        /** Paginação: viagens anteriores a este instante. */
        before: z.iso.datetime({ offset: true }).optional(),
        /** Período (datas no fuso da operação, AAAA-MM-DD). */
        from: z.iso.date().optional(),
        to: z.iso.date().optional(),
        lineId: idParam.optional(),
      }),
      req.query,
    );
    // Filtros do período/linha/tipo valem para a lista e o resumo; `before` (paginação) só para a lista
    const where = ['user_id = $1'];
    const params: unknown[] = [currentUser(req).id];
    if (q.kind) where.push(`kind = $${params.push(q.kind)}`);
    if (q.from) where.push(`created_at >= ($${params.push(q.from)}::date)::timestamp AT TIME ZONE 'America/Sao_Paulo'`);
    if (q.to) where.push(`created_at < ($${params.push(q.to)}::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo'`);
    if (q.lineId) where.push(`legs @> $${params.push(JSON.stringify([{ lineId: q.lineId }]))}::jsonb`);
    const summaryWhere = where.join(' AND ');
    const summaryParams = params.slice();
    if (q.before) where.push(`created_at < $${params.push(q.before)}`);
    const [rows, summary] = await Promise.all([
      db.query<TripRow>(`SELECT * FROM trips WHERE ${where.join(' AND ')} ORDER BY created_at DESC, id LIMIT $${params.push(q.limit + 1)}`, params),
      db.query<{ trips: number; planned: number; minutes: number; distance: number }>(
        `SELECT count(*) FILTER (WHERE kind = 'completed')::int AS trips, count(*) FILTER (WHERE kind = 'planned')::int AS planned,
                COALESCE(sum(duration_min) FILTER (WHERE kind = 'completed'), 0)::int AS minutes,
                COALESCE(sum(distance_m) FILTER (WHERE kind = 'completed'), 0)::int AS distance
           FROM trips WHERE ${summaryWhere}`,
        summaryParams,
      ),
    ]);
    const more = rows.rows.length > q.limit;
    const items = rows.rows.slice(0, q.limit);
    res.json({
      data: items.map(tripDto),
      meta: { nextBefore: more ? items.at(-1)!.created_at.toISOString() : null, summary: summary.rows[0] },
    });
  });

  // Registro de uma viagem feita (um trecho, como na Sprint 1)
  r.post('/trips', async (req, res) => {
    const body = parse(
      z.object({
        lineId: dbId,
        originStopId: dbId,
        destStopId: dbId,
      }),
      req.body,
    );
    const seg = tripSegment(await cache.get(), body.lineId, body.originStopId, body.destStopId);
    const row = await insertTrip(currentUser(req).id, 'completed', [legOf(seg)], 0);
    res.status(201).json({ data: tripDto(row) });
  });

  // US15/US19 — guarda uma opção do planejador (até 2 trechos de ônibus, com baldeação) como viagem planejada
  r.post('/trips/planned', async (req, res) => {
    const body = parse(
      z.object({
        legs: z
          .array(z.object({ lineId: dbId, originStopId: dbId, destStopId: dbId }))
          .min(1, 'Informe ao menos um trecho')
          .max(3, 'No máximo 3 trechos'),
        walkMin: z.number().int().min(0).max(180).default(0),
      }),
      req.body,
    );
    const net = await cache.get();
    // Distância e duração vêm da rede, não do aparelho
    const legs = body.legs.map((l) => legOf(tripSegment(net, l.lineId, l.originStopId, l.destStopId)));
    const row = await insertTrip(currentUser(req).id, 'planned', legs, body.walkMin);
    res.status(201).json({ data: tripDto(row) });
  });

  // Viagem planejada que foi feita: passa a contar no resumo
  r.post('/trips/:id/complete', async (req, res) => {
    const { rows } = await db.query<TripRow>(
      `UPDATE trips SET kind = 'completed', completed_at = COALESCE(completed_at, $3)
        WHERE id = $1 AND user_id = $2 RETURNING *`,
      [parse(z.uuid('Id inválido'), req.params.id), currentUser(req).id, clock()],
    );
    if (!rows[0]) throw notFound('Viagem');
    res.json({ data: tripDto(rows[0]) });
  });

  r.delete('/trips/:id', async (req, res) => {
    const { rowCount } = await db.query('DELETE FROM trips WHERE id = $1 AND user_id = $2', [
      parse(z.uuid('Id inválido'), req.params.id),
      currentUser(req).id,
    ]);
    if (!rowCount) throw notFound('Viagem');
    res.status(204).end();
  });

  async function insertTrip(userId: string, kind: 'planned' | 'completed', legs: TripLeg[], walkMin: number): Promise<TripRow> {
    const { rows: count } = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM trips WHERE user_id = $1', [userId]);
    if (count[0]!.n >= MAX_TRIPS_PER_USER) {
      throw new AppError(409, 'too_many_trips', 'Seu histórico está cheio. Apague viagens antigas para registrar novas.');
    }
    const first = legs[0]!;
    const last = legs.at(-1)!;
    const now = clock();
    const { rows } = await db.query<TripRow>(
      `INSERT INTO trips (user_id, kind, line_id, line_code, origin_stop_id, dest_stop_id, origin_label, dest_label,
                          duration_min, distance_m, legs, transfers, walk_min, completed_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
      [
        userId,
        kind,
        first.lineId,
        legs.map((l) => l.lineCode).join(' + '),
        first.originStopId,
        last.destStopId,
        first.originLabel,
        last.destLabel,
        legs.reduce((a, l) => a + l.durationMin, 0) + walkMin,
        legs.reduce((a, l) => a + l.distanceM, 0),
        JSON.stringify(legs),
        legs.length - 1,
        walkMin,
        kind === 'completed' ? now : null,
        now,
      ],
    );
    return rows[0]!;
  }

  // ---------- Dashboard (US12) ----------
  r.get('/dashboard', async (req, res) => {
    const q = parse(
      z.object({ lat: z.coerce.number().min(-90).max(90).optional(), lng: z.coerce.number().min(-180).max(180).optional() }),
      req.query,
    );
    const userId = currentUser(req).id;
    const net = await cache.get();
    const now = clock();
    const c = clockFor(now);
    const here: LatLng | null = q.lat != null && q.lng != null ? [q.lat, q.lng] : null;
    const [favorites, extra, active] = await Promise.all([listFavorites(userId), services.alerts.extraDelay(now), services.alerts.active(now)]);

    // Próxima passagem de cada favorita no ponto da linha mais perto do usuário (ou no ponto inicial)
    const nextDepartures = favorites.flatMap((f) => {
      const line = net.lineById.get(f.id)!;
      if (!isOperating(line) || line.stops.length === 0) return [];
      const stops = line.stops.map((ls) => net.stops.get(ls.stopId)!);
      const stop = here
        ? stops.reduce((best, s) => (haversine(here, [s.lat, s.lng]) < haversine(here, [best.lat, best.lng]) ? s : best))
        : stops[0]!;
      const next = predictedArrivals(line, stop.id, c, 1, extra)[0];
      return next
        ? [{ line: { id: line.id, code: line.code, name: line.name, color: line.color }, stop: { id: stop.id, name: stop.name }, ...next }]
        : [];
    });
    nextDepartures.sort((a, b) => a.inMin - b.inMin);

    const [recent, month, total, unread] = await Promise.all([
      db.query<TripRow>("SELECT * FROM trips WHERE user_id = $1 AND kind = 'completed' ORDER BY created_at DESC LIMIT 3", [userId]),
      db.query<{ trips: number; minutes: number; distance: number }>(
        `SELECT count(*)::int AS trips, COALESCE(sum(duration_min), 0)::int AS minutes,
                COALESCE(sum(distance_m), 0)::int AS distance
           FROM trips WHERE user_id = $1 AND kind = 'completed' AND created_at > $2::timestamptz - interval '30 days'`,
        [userId, now],
      ),
      db.query<{ trips: number; top_line: string | null }>(
        `SELECT count(*)::int AS trips,
                (SELECT l->>'lineCode' FROM trips t, jsonb_array_elements(t.legs) l
                  WHERE t.user_id = $1 AND t.kind = 'completed'
                  GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1) AS top_line
           FROM trips WHERE user_id = $1 AND kind = 'completed'`,
        [userId],
      ),
      db.query<{ n: number }>('SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [userId]),
    ]);
    const favIds = new Set(favorites.map((f) => f.id));

    res.json({
      data: {
        favorites,
        nextDepartures,
        trips: {
          last30Days: month.rows[0],
          total: total.rows[0]!.trips,
          mostUsedLine: total.rows[0]!.top_line,
          recent: recent.rows.map(tripDto),
        },
        // US17/US20 — sininho com o número de não lidas e avisos ativos das favoritas
        unreadNotifications: unread.rows[0]!.n,
        alerts: active.filter((a) => favIds.has(a.lineId)).map((a) => alertDto(a, now)),
      },
    });
  });

  return r;
}
