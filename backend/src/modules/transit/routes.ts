import { Router } from 'express';
import { z } from 'zod';
import type { Deps } from '../../app.js';
import { notFound } from '../../lib/errors.js';
import { haversine, polylineLength, type LatLng } from '../../lib/geo.js';
import { idParam, parse } from '../../lib/http.js';
import { ratingSummaries, type RatingSummary } from '../community/ratings.js';
import { alertDto } from '../realtime/service-alerts.js';
import type { Services } from '../realtime/services.js';
import { clockFor, predictedArrivals, vehiclesOfLine } from '../realtime/simulation.js';
import type { NetLine, Network, NetworkCache } from './network.js';
import { isOperating, timetableAtStop } from './schedule.js';

const serviceTypeSchema = z.enum(['normal', 'executivo', 'noturno', 'expresso']);

/** Normaliza para busca: minúsculas e sem acentos ("satelite" acha "Satélite"). */
export const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

const NO_RATING: RatingSummary = { average: null, count: 0 };

export function lineSummary(line: NetLine, favorites: Set<number>, ratings?: Map<number, RatingSummary>) {
  return {
    id: line.id,
    code: line.code,
    name: line.name,
    origin: line.origin,
    destination: line.destination,
    mode: line.mode,
    serviceType: line.serviceType,
    status: line.status,
    color: line.color,
    headwayMin: line.headwayMin,
    firstDeparture: line.firstDeparture,
    lastDeparture: line.lastDeparture,
    stopsCount: line.stops.length,
    operating: isOperating(line),
    isFavorite: favorites.has(line.id),
    // US22 — média das avaliações
    rating: ratings?.get(line.id) ?? NO_RATING,
  };
}

export async function favoriteIds(deps: Deps, userId?: string): Promise<Set<number>> {
  if (!userId) return new Set();
  const { rows } = await deps.db.query<{ line_id: number }>('SELECT line_id FROM favorites WHERE user_id = $1', [userId]);
  return new Set(rows.map((r) => r.line_id));
}

export function lineShape(net: Network, line: NetLine): LatLng[] {
  return line.shape.length
    ? line.shape
    : line.stops.map((ls) => {
        const s = net.stops.get(ls.stopId)!;
        return [s.lat, s.lng] as LatLng;
      });
}

/** Rotas públicas (com usuário opcional para marcar favoritos): linhas e paradas. */
export function transitRoutes(deps: Deps, cache: NetworkCache, services: Services): Router {
  const { clock } = deps;
  const r = Router();

  // US05 — todas as linhas; US06 — busca por número ou nome (sem acento, número exato primeiro)
  r.get('/lines', async (req, res) => {
    const q = parse(
      z.object({
        q: z.string().max(60).optional(),
        serviceType: serviceTypeSchema.optional(),
        includeInactive: z.enum(['true', 'false']).optional(),
      }),
      req.query,
    );
    const net = await cache.get();
    const [favs, ratings] = await Promise.all([favoriteIds(deps, req.user?.id), ratingSummaries(deps.db)]);
    const term = q.q ? normalize(q.q) : '';
    let lines = net.lines.filter(
      (l) =>
        (q.includeInactive === 'true' || l.status !== 'inactive') &&
        (!q.serviceType || l.serviceType === q.serviceType) &&
        (!term || normalize(`${l.code} ${l.name} ${l.origin} ${l.destination}`).includes(term)),
    );
    const rank = (l: NetLine) => (!term ? 0 : normalize(l.code) === term ? 0 : normalize(l.code).startsWith(term) ? 1 : 2);
    lines = [...lines].sort((a, b) => rank(a) - rank(b) || a.code.localeCompare(b.code, 'pt-BR', { numeric: true }));
    res.json({ data: lines.map((l) => lineSummary(l, favs, ratings)) });
  });

  // US07/US08 — detalhe da linha: trajeto para o mapa e paradas com o próximo horário
  r.get('/lines/:id', async (req, res) => {
    const net = await cache.get();
    const line = net.lineById.get(parse(idParam, req.params.id));
    if (!line) throw notFound('Linha');
    const now = clock();
    const c = clockFor(now);
    const [favs, ratings, upcoming, extra] = await Promise.all([
      favoriteIds(deps, req.user?.id),
      ratingSummaries(deps.db),
      services.alerts.upcoming(now),
      services.alerts.extraDelay(now),
    ]);
    const shape = lineShape(net, line);
    const stops = line.stops.map((ls) => {
      const s = net.stops.get(ls.stopId)!;
      const next = isOperating(line) ? predictedArrivals(line, s.id, c, 1, extra)[0] : undefined;
      return {
        id: s.id,
        code: s.code,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        seq: ls.seq,
        offsetMin: ls.offsetMin,
        linesCount: net.linesByStop.get(s.id)?.length ?? 1,
        nextArrival: next ?? null,
      };
    });
    res.json({
      data: {
        ...lineSummary(line, favs, ratings),
        shape,
        lengthM: Math.round(polylineLength(shape)),
        durationMin: line.stops.at(-1)?.offsetMin ?? 0,
        stops,
        // US16/US17 — ônibus em circulação agora e avisos (desvio, atraso anunciado)
        vehiclesCount: vehiclesOfLine(net, line, c, extra).length,
        alerts: upcoming.filter((a) => a.lineId === line.id).map((a) => alertDto(a, now)),
      },
    });
  });

  // US08 — pontos de parada: busca por nome/código, ordenados por nome, distância ou nº de linhas
  r.get('/stops', async (req, res) => {
    const q = parse(
      z.object({
        q: z.string().max(60).optional(),
        sort: z.enum(['name', 'distance', 'lines']).default('name'),
        lat: z.coerce.number().min(-90).max(90).optional(),
        lng: z.coerce.number().min(-180).max(180).optional(),
        limit: z.coerce.number().int().min(1).max(500).default(200),
      }),
      req.query,
    );
    const net = await cache.get();
    const term = q.q ? normalize(q.q) : '';
    const here: LatLng | null = q.lat != null && q.lng != null ? [q.lat, q.lng] : null;
    const list = [...net.stops.values()]
      .filter((s) => !term || normalize(`${s.name} ${s.code}`).includes(term))
      .map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        lines: (net.linesByStop.get(s.id) ?? []).filter((l) => l.status === 'active').map((l) => l.code),
        distanceM: here ? Math.round(haversine(here, [s.lat, s.lng])) : null,
      }));
    if (q.sort === 'distance' && here) list.sort((a, b) => a.distanceM! - b.distanceM!);
    else if (q.sort === 'lines') list.sort((a, b) => b.lines.length - a.lines.length || a.name.localeCompare(b.name, 'pt-BR'));
    else list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    res.json({ data: list.slice(0, q.limit) });
  });

  // US09 — linhas que passam na parada e horários previstos
  r.get('/stops/:id', async (req, res) => {
    const net = await cache.get();
    const s = net.stops.get(parse(idParam, req.params.id));
    if (!s) throw notFound('Ponto de parada');
    const now = clock();
    const c = clockFor(now);
    const [extra, active] = await Promise.all([services.alerts.extraDelay(now), services.alerts.active(now)]);
    const lines = (net.linesByStop.get(s.id) ?? [])
      .filter((l) => l.status === 'active')
      .map((l) => ({
        id: l.id,
        code: l.code,
        name: l.name,
        color: l.color,
        serviceType: l.serviceType,
        firstDeparture: l.firstDeparture,
        lastDeparture: l.lastDeparture,
        headwayMin: l.headwayMin,
        // US09 + US16 — próximas passagens com o atraso previsto
        arrivals: predictedArrivals(l, s.id, c, 3, extra),
        timetable: timetableAtStop(l, s.id),
        // US27 — o app calcula as próximas passagens sozinho (offline) com estes dados
        offsets: l.stops.filter((ls) => ls.stopId === s.id).map((ls) => ls.offsetMin),
        alerts: active.filter((a) => a.lineId === l.id).map((a) => alertDto(a, now)),
      }))
      .sort((a, b) => (a.arrivals[0]?.inMin ?? 9999) - (b.arrivals[0]?.inMin ?? 9999));
    res.json({ data: { id: s.id, code: s.code, name: s.name, lat: s.lat, lng: s.lng, lines } });
  });

  // US16 — ônibus da linha em circulação agora (posição simulada) e, com `stopId`, a chegada de cada um ao ponto
  r.get('/lines/:id/vehicles', async (req, res) => {
    const net = await cache.get();
    const line = net.lineById.get(parse(idParam, req.params.id));
    if (!line) throw notFound('Linha');
    const q = parse(z.object({ stopId: idParam.optional() }), req.query);
    const now = clock();
    const c = clockFor(now);
    const [extra, active] = await Promise.all([services.alerts.extraDelay(now), services.alerts.active(now)]);
    const vehicles = vehiclesOfLine(net, line, c, extra);
    let stop = null;
    if (q.stopId != null) {
      const st = net.stops.get(q.stopId);
      const idx = line.stops.findIndex((ls) => ls.stopId === q.stopId);
      if (!st || idx < 0) throw notFound('Ponto de parada desta linha');
      stop = { id: st.id, name: st.name, lat: st.lat, lng: st.lng, arrivals: predictedArrivals(line, st.id, c, 3, extra) };
    }
    res.set('Cache-Control', 'no-store').json({
      data: {
        line: { id: line.id, code: line.code, name: line.name, color: line.color },
        updatedAt: now.toISOString(),
        vehicles,
        stop,
        alerts: active.filter((a) => a.lineId === line.id).map((a) => alertDto(a, now)),
      },
    });
  });

  // US17 — avisos de serviço (atraso anunciado, desvio, suspensão) ativos ou programados
  r.get('/service-alerts', async (req, res) => {
    const now = clock();
    const net = await cache.get();
    const list = (await services.alerts.upcoming(now)).flatMap((a) => {
      const line = net.lineById.get(a.lineId);
      return line ? [{ ...alertDto(a, now), line: { id: line.id, code: line.code, name: line.name, color: line.color } }] : [];
    });
    res.json({ data: list });
  });

  return r;
}
