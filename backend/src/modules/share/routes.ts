import { randomBytes } from 'node:crypto';
import { Router, type Request } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { Deps } from '../../app.js';
import { currentUser } from '../../lib/auth.js';
import { AppError, badRequest, notFound } from '../../lib/errors.js';
import { haversine } from '../../lib/geo.js';
import { withTransaction } from '../../db/pool.js';
import { dbId, parse } from '../../lib/http.js';
import { sha256 } from '../auth/routes.js';
import { publicAuthor } from '../community/text.js';
import type { Services } from '../realtime/services.js';
import { clockFor } from '../realtime/simulation.js';
import type { NetworkCache } from '../transit/network.js';
import { formatHHMM } from '../transit/schedule.js';
import { sharePage } from './page.js';

const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);
export const MAX_ACTIVE_SHARES = 5;

interface ShareRow {
  id: string;
  user_id: string;
  line_id: number | null;
  dest_stop_id: number | null;
  lat: number | null;
  lng: number | null;
  position_at: Date;
  expires_at: Date;
  stopped_at: Date | null;
  created_at: Date;
  name?: string;
}

const isActive = (s: ShareRow, now: Date) => !s.stopped_at && s.expires_at > now;

/** US29 — compartilhar localização (e a rota de ônibus) com um contato por um link temporário. */
export function shareRoutes(deps: Deps, cache: NetworkCache, services: Services) {
  const { db, clock, config } = deps;
  const me = Router();
  const pub = Router();

  /** Link público. Em produção use PUBLIC_SHARE_URL (o endereço que o contato consegue abrir). */
  const linkFor = (req: Request, token: string) => {
    const base = config.PUBLIC_SHARE_URL || `${req.protocol}://${req.get('host')}/s`;
    return `${base.replace(/\/+$/, '')}/${token}`;
  };

  /** Estimativa de chegada: do ponto da linha mais perto da pessoa até o destino, pela programação + atraso. */
  const routeInfo = async (s: ShareRow, now: Date) => {
    if (!s.line_id) return null;
    const net = await cache.get();
    const line = net.lineById.get(s.line_id);
    if (!line) return null;
    const dest = s.dest_stop_id ? net.stops.get(s.dest_stop_id) : undefined;
    const info = { line: { id: line.id, code: line.code, name: line.name, color: line.color }, dest: dest ? { id: dest.id, name: dest.name } : null, eta: null as string | null, etaInMin: null as number | null };
    if (!dest || s.lat == null || s.lng == null) return info;
    const destIdx = line.stops.findIndex((ls) => ls.stopId === dest.id);
    let nearest = -1;
    let best = Infinity;
    line.stops.forEach((ls, i) => {
      const st = net.stops.get(ls.stopId)!;
      const d = haversine([s.lat!, s.lng!], [st.lat, st.lng]);
      if (i <= destIdx && d < best) {
        best = d;
        nearest = i;
      }
    });
    if (nearest < 0 || destIdx < 0) return info;
    const extra = (await services.alerts.extraDelay(now)).get(line.id) ?? 0;
    const minutes = line.stops[destIdx]!.offsetMin - line.stops[nearest]!.offsetMin + extra;
    const c = clockFor(now);
    info.eta = formatHHMM(c.nowMin + minutes);
    info.etaInMin = Math.max(0, Math.round(minutes));
    return info;
  };

  const dto = async (s: ShareRow, now: Date, url?: string) => ({
    id: s.id,
    url,
    active: isActive(s, now),
    lat: s.lat,
    lng: s.lng,
    positionAt: s.position_at.toISOString(),
    expiresAt: s.expires_at.toISOString(),
    stoppedAt: s.stopped_at?.toISOString() ?? null,
    route: await routeInfo(s, now),
  });

  // ---------- Dono do compartilhamento (logado) ----------
  me.post('/shares', async (req, res) => {
    const b = parse(
      z.object({
        lat,
        lng,
        lineId: dbId.nullable().optional(),
        destStopId: dbId.nullable().optional(),
        durationMin: z.number().int().min(5).max(240).default(30),
      }),
      req.body,
    );
    const net = await cache.get();
    if (b.lineId != null) {
      const line = net.lineById.get(b.lineId);
      if (!line) throw notFound('Linha');
      if (b.destStopId != null && !line.stops.some((ls) => ls.stopId === b.destStopId)) throw badRequest('O destino precisa ser uma parada da linha');
    } else if (b.destStopId != null) throw badRequest('Escolha a linha para compartilhar a rota');
    const userId = currentUser(req).id;
    const now = clock();
    const token = randomBytes(24).toString('base64url');
    // Contagem e inserção na mesma transação, com trava por usuário: pedidos em paralelo não furam o limite
    const rows = await withTransaction(db, async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`share:${userId}`]);
      const { rows: active } = await c.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM location_shares WHERE user_id = $1 AND stopped_at IS NULL AND expires_at > $2',
        [userId, now],
      );
      if (active[0]!.n >= MAX_ACTIVE_SHARES) throw new AppError(409, 'too_many_shares', 'Encerre um compartilhamento ativo antes de criar outro');
      const ins = await c.query<ShareRow>(
        `INSERT INTO location_shares (token_hash, user_id, line_id, dest_stop_id, lat, lng, position_at, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7::timestamptz + make_interval(mins => $8), $7) RETURNING *`,
        [sha256(token), userId, b.lineId ?? null, b.destStopId ?? null, b.lat, b.lng, now, b.durationMin],
      );
      return ins.rows;
    });
    // O token só aparece nesta resposta (no banco fica o hash)
    res.status(201).json({ data: await dto(rows[0]!, now, linkFor(req, token)) });
  });

  me.get('/shares', async (req, res) => {
    const now = clock();
    const { rows } = await db.query<ShareRow>(
      'SELECT * FROM location_shares WHERE user_id = $1 AND stopped_at IS NULL AND expires_at > $2 ORDER BY created_at DESC',
      [currentUser(req).id, now],
    );
    res.json({ data: await Promise.all(rows.map((s) => dto(s, now))) });
  });

  const ownActive = async (req: Request) => {
    const id = parse(z.uuid('Id inválido'), req.params.id);
    const { rows } = await db.query<ShareRow>('SELECT * FROM location_shares WHERE id = $1 AND user_id = $2', [id, currentUser(req).id]);
    if (!rows[0]) throw notFound('Compartilhamento');
    return rows[0];
  };

  // Atualiza a posição (o app envia enquanto o compartilhamento estiver ativo)
  me.put('/shares/:id/position', async (req, res) => {
    const b = parse(z.object({ lat, lng }), req.body);
    const s = await ownActive(req);
    const now = clock();
    if (!isActive(s, now)) throw new AppError(410, 'share_ended', 'Este compartilhamento já terminou');
    const { rows } = await db.query<ShareRow>('UPDATE location_shares SET lat = $2, lng = $3, position_at = $4 WHERE id = $1 RETURNING *', [
      s.id,
      b.lat,
      b.lng,
      now,
    ]);
    res.json({ data: await dto(rows[0]!, now) });
  });

  me.delete('/shares/:id', async (req, res) => {
    const s = await ownActive(req);
    // Encerrar apaga a posição guardada
    await db.query('UPDATE location_shares SET stopped_at = COALESCE(stopped_at, $2), lat = NULL, lng = NULL WHERE id = $1', [s.id, clock()]);
    res.status(204).end();
  });

  // ---------- Quem recebeu o link (sem login) ----------
  // Token adivinhado na força bruta é inviável (192 bits), mas limita varredura e abuso mesmo assim
  pub.use(
    ['/s', '/api/v1/shares'],
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      skip: () => config.NODE_ENV === 'test',
      handler: (_req, res) => res.status(429).json({ error: { code: 'rate_limited', message: 'Muitas requisições. Tente mais tarde.' } }),
    }),
  );

  const byToken = async (raw: string) => {
    const token = parse(z.string().regex(/^[A-Za-z0-9_-]{32}$/, 'Link inválido'), raw);
    const { rows } = await db.query<ShareRow>(
      'SELECT s.*, u.name FROM location_shares s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1',
      [sha256(token)],
    );
    return rows[0] ?? null;
  };

  const publicView = async (s: ShareRow, now: Date) => {
    const active = isActive(s, now);
    return {
      name: publicAuthor(s.name ?? ''),
      active,
      // Encerrado: a posição deixa de ser mostrada
      position: active && s.lat != null && s.lng != null ? { lat: s.lat, lng: s.lng, at: s.position_at.toISOString() } : null,
      expiresAt: s.expires_at.toISOString(),
      route: active ? await routeInfo(s, now) : null,
    };
  };

  pub.get('/api/v1/shares/:token', async (req, res) => {
    const s = await byToken(req.params.token);
    if (!s) throw notFound('Compartilhamento');
    res.set('Cache-Control', 'no-store').json({ data: await publicView(s, clock()) });
  });

  pub.get('/s/:token', async (req, res) => {
    const s = await byToken(req.params.token).catch(() => null);
    const now = clock();
    res
      .status(s ? 200 : 404)
      .set({
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
        'Referrer-Policy': 'no-referrer',
        // Só estilo inline e o mapa embutido do OpenStreetMap; nenhum script
        'Content-Security-Policy':
          "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; frame-src https://www.openstreetmap.org; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      })
      .type('html')
      .send(sharePage(s ? await publicView(s, now) : null, now));
  });

  return { me, pub };
}
