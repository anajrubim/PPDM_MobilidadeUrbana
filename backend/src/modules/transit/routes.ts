import { Router } from 'express';
import { z } from 'zod';
import type { Deps } from '../../app.js';
import { notFound } from '../../lib/errors.js';
import { haversine, polylineLength, type LatLng } from '../../lib/geo.js';
import { idParam, parse } from '../../lib/http.js';
import type { NetLine, Network, NetworkCache } from './network.js';
import { isOperating, minutesOfDay, nextArrivalsAtStop, timetableAtStop } from './schedule.js';

const serviceTypeSchema = z.enum(['normal', 'executivo', 'noturno', 'expresso']);

/** Normaliza para busca: minúsculas e sem acentos ("satelite" acha "Satélite"). */
export const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

export function lineSummary(line: NetLine, favorites: Set<number>) {
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
export function transitRoutes(deps: Deps, cache: NetworkCache): Router {
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
    const favs = await favoriteIds(deps, req.user?.id);
    const term = q.q ? normalize(q.q) : '';
    let lines = net.lines.filter(
      (l) =>
        (q.includeInactive === 'true' || l.status !== 'inactive') &&
        (!q.serviceType || l.serviceType === q.serviceType) &&
        (!term || normalize(`${l.code} ${l.name} ${l.origin} ${l.destination}`).includes(term)),
    );
    const rank = (l: NetLine) => (!term ? 0 : normalize(l.code) === term ? 0 : normalize(l.code).startsWith(term) ? 1 : 2);
    lines = [...lines].sort((a, b) => rank(a) - rank(b) || a.code.localeCompare(b.code, 'pt-BR', { numeric: true }));
    res.json({ data: lines.map((l) => lineSummary(l, favs)) });
  });

  // US07/US08 — detalhe da linha: trajeto para o mapa e paradas com o próximo horário
  r.get('/lines/:id', async (req, res) => {
    const net = await cache.get();
    const line = net.lineById.get(parse(idParam, req.params.id));
    if (!line) throw notFound('Linha');
    const favs = await favoriteIds(deps, req.user?.id);
    const nowMin = minutesOfDay(clock());
    const shape = lineShape(net, line);
    const stops = line.stops.map((ls) => {
      const s = net.stops.get(ls.stopId)!;
      const next = isOperating(line) ? nextArrivalsAtStop(line, s.id, nowMin, 1)[0] : undefined;
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
        ...lineSummary(line, favs),
        shape,
        lengthM: Math.round(polylineLength(shape)),
        durationMin: line.stops.at(-1)?.offsetMin ?? 0,
        stops,
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
    const nowMin = minutesOfDay(clock());
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
        arrivals: nextArrivalsAtStop(l, s.id, nowMin, 3),
        timetable: timetableAtStop(l, s.id),
      }))
      .sort((a, b) => (a.arrivals[0]?.inMin ?? 9999) - (b.arrivals[0]?.inMin ?? 9999));
    res.json({ data: { id: s.id, code: s.code, name: s.name, lat: s.lat, lng: s.lng, lines } });
  });

  return r;
}
