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
import type { Network, NetworkCache } from '../transit/network.js';
import { lineSummary } from '../transit/routes.js';
import { isOperating, minutesOfDay, nextArrivalsAtStop } from '../transit/schedule.js';

interface TripRow {
  id: string;
  line_id: number | null;
  line_code: string;
  origin_label: string;
  dest_label: string;
  duration_min: number;
  distance_m: number;
  created_at: Date;
}

const tripDto = (t: TripRow) => ({
  id: t.id,
  lineId: t.line_id,
  lineCode: t.line_code,
  originLabel: t.origin_label,
  destLabel: t.dest_label,
  durationMin: t.duration_min,
  distanceM: t.distance_m,
  createdAt: t.created_at.toISOString(),
});

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
export function meRoutes(deps: Deps, cache: NetworkCache): Router {
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
    const { rows } = await db.query<{ line_id: number }>('SELECT line_id FROM favorites WHERE user_id = $1 ORDER BY created_at', [userId]);
    const ids = new Set(rows.map((f) => f.line_id));
    return rows.flatMap((f) => {
      const line = net.lineById.get(f.line_id);
      return line ? [lineSummary(line, ids)] : [];
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

  // ---------- Viagens (base do resumo do dashboard, US12) ----------
  r.get('/trips', async (req, res) => {
    const { limit } = parse(z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) }), req.query);
    const { rows } = await db.query<TripRow>('SELECT * FROM trips WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2', [
      currentUser(req).id,
      limit,
    ]);
    res.json({ data: rows.map(tripDto) });
  });

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
    const { rows } = await db.query<TripRow>(
      `INSERT INTO trips (user_id, line_id, line_code, origin_stop_id, dest_stop_id, origin_label, dest_label,
                          duration_min, distance_m, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        currentUser(req).id,
        seg.line.id,
        seg.line.code,
        seg.origin.id,
        seg.dest.id,
        seg.origin.name,
        seg.dest.name,
        seg.durationMin,
        seg.distanceM,
        clock(),
      ],
    );
    res.status(201).json({ data: tripDto(rows[0]!) });
  });

  // ---------- Dashboard (US12) ----------
  r.get('/dashboard', async (req, res) => {
    const q = parse(
      z.object({ lat: z.coerce.number().min(-90).max(90).optional(), lng: z.coerce.number().min(-180).max(180).optional() }),
      req.query,
    );
    const userId = currentUser(req).id;
    const net = await cache.get();
    const now = clock();
    const nowMin = minutesOfDay(now);
    const here: LatLng | null = q.lat != null && q.lng != null ? [q.lat, q.lng] : null;
    const favorites = await listFavorites(userId);

    // Próxima passagem de cada favorita no ponto da linha mais perto do usuário (ou no ponto inicial)
    const nextDepartures = favorites.flatMap((f) => {
      const line = net.lineById.get(f.id)!;
      if (!isOperating(line) || line.stops.length === 0) return [];
      const stops = line.stops.map((ls) => net.stops.get(ls.stopId)!);
      const stop = here
        ? stops.reduce((best, s) => (haversine(here, [s.lat, s.lng]) < haversine(here, [best.lat, best.lng]) ? s : best))
        : stops[0]!;
      const next = nextArrivalsAtStop(line, stop.id, nowMin, 1)[0];
      return next
        ? [{ line: { id: line.id, code: line.code, name: line.name, color: line.color }, stop: { id: stop.id, name: stop.name }, ...next }]
        : [];
    });
    nextDepartures.sort((a, b) => a.inMin - b.inMin);

    const [recent, month, total] = await Promise.all([
      db.query<TripRow>('SELECT * FROM trips WHERE user_id = $1 ORDER BY created_at DESC LIMIT 3', [userId]),
      db.query<{ trips: number; minutes: number; distance: number }>(
        `SELECT count(*)::int AS trips, COALESCE(sum(duration_min), 0)::int AS minutes,
                COALESCE(sum(distance_m), 0)::int AS distance
           FROM trips WHERE user_id = $1 AND created_at > $2::timestamptz - interval '30 days'`,
        [userId, now],
      ),
      db.query<{ trips: number; top_line: string | null }>(
        `SELECT count(*)::int AS trips,
                (SELECT line_code FROM trips WHERE user_id = $1 GROUP BY line_code ORDER BY count(*) DESC, line_code LIMIT 1) AS top_line
           FROM trips WHERE user_id = $1`,
        [userId],
      ),
    ]);

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
      },
    });
  });

  return r;
}
