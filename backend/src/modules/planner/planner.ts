import { haversine, polylineLength, type LatLng } from '../../lib/geo.js';
import type { NetLine, NetStop, Network } from '../transit/network.js';
import { formatHHMM } from '../transit/schedule.js';
import { tripInstances, type Clock, type ExtraDelay } from '../realtime/simulation.js';

/**
 * US15 — planejamento de viagem (origem → destino) com até uma baldeação; US26 — tempo estimado.
 *
 * Busca exaustiva sobre a rede (poucas linhas): caminhada até pontos próximos, espera pelo próximo ônibus
 * (com o atraso previsto, US16), trecho de ônibus, baldeação a pé entre pontos próximos e caminhada final.
 */

/** 4,5 km/h — velocidade média de caminhada. */
export const WALK_M_PER_MIN = 75;
/** Ruas não são linha reta: a distância a pé é ~25% maior que a em linha reta. */
const WALK_DETOUR = 1.25;
const MAX_ACCESS_WALK_M = 900;
const FALLBACK_ACCESS_WALK_M = 2500;
const MAX_TRANSFER_WALK_M = 350;
const MIN_TRANSFER_MIN = 1;
const MAX_WALK_ONLY_M = 1500;
const MAX_RESULTS = 5;

export const walkMinutes = (straightM: number) => Math.ceil((straightM * WALK_DETOUR) / WALK_M_PER_MIN);

export type Place = { kind: 'point'; pos: LatLng; label: string } | { kind: 'stop'; stop: NetStop };

const posOf = (p: Place): LatLng => (p.kind === 'stop' ? [p.stop.lat, p.stop.lng] : p.pos);
const labelOf = (p: Place) => (p.kind === 'stop' ? p.stop.name : p.label);

interface Access {
  stop: NetStop;
  walkM: number;
  walkMin: number;
}

/** Pontos de parada a uma caminhada razoável do lugar (o próprio ponto, se o lugar for uma parada). */
function accessStops(net: Network, place: Place): Access[] {
  const here = posOf(place);
  const all = [...net.stops.values()]
    .filter((s) => (net.linesByStop.get(s.id) ?? []).some((l) => l.status === 'active'))
    .map((s) => ({ stop: s, walkM: place.kind === 'stop' && place.stop.id === s.id ? 0 : haversine(here, [s.lat, s.lng]) }))
    .sort((a, b) => a.walkM - b.walkM);
  const near = all.filter((a) => a.walkM <= (place.kind === 'stop' ? MAX_TRANSFER_WALK_M : MAX_ACCESS_WALK_M)).slice(0, 10);
  const list = near.length ? near : all.filter((a) => a.walkM <= FALLBACK_ACCESS_WALK_M).slice(0, 3);
  return list.map((a) => ({ ...a, walkM: Math.round(a.walkM * WALK_DETOUR), walkMin: a.walkM === 0 ? 0 : walkMinutes(a.walkM) }));
}

/** Passagens de cada viagem por um índice de parada, ordenadas — para achar "o próximo ônibus" por busca binária. */
interface Boarding {
  at: number;
  /** início efetivo da viagem (partida programada + atraso previsto) */
  base: number;
  delayMin: number;
  live: boolean;
  tripId: string;
}

class Timetables {
  private byLine = new Map<number, { trips: Omit<Boarding, 'at'>[] }>();
  constructor(
    private readonly clock: Clock,
    private readonly extra: ExtraDelay,
  ) {}

  private tripsOf(line: NetLine) {
    let t = this.byLine.get(line.id);
    if (!t) {
      const known = this.extra.get(line.id) ?? 0;
      const trips = tripInstances(line, this.clock, this.extra, 1440).map((tr) => {
        const delay = tr.started ? tr.delayMin : known;
        return { base: tr.startMin + delay, delayMin: delay, live: tr.started, tripId: tr.id };
      });
      trips.sort((a, b) => a.base - b.base);
      t = { trips };
      this.byLine.set(line.id, t);
    }
    return t.trips;
  }

  /** Primeiro ônibus da linha que passa no índice `idx` a partir de `earliest` (minutos). */
  next(line: NetLine, idx: number, earliest: number): Boarding | null {
    const trips = this.tripsOf(line);
    const offset = line.stops[idx]!.offsetMin;
    // base + offset >= earliest  →  base >= earliest - offset
    const target = earliest - offset;
    let lo = 0;
    let hi = trips.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (trips[mid]!.base < target) lo = mid + 1;
      else hi = mid;
    }
    const t = trips[lo];
    return t ? { ...t, at: t.base + offset } : null;
  }
}

export interface BusLeg {
  type: 'bus';
  line: { id: number; code: string; name: string; color: string };
  from: { id: number; name: string; lat: number; lng: number };
  to: { id: number; name: string; lat: number; lng: number };
  departAt: string;
  arriveAt: string;
  waitMin: number;
  rideMin: number;
  stopsCount: number;
  distanceM: number;
  delayMin: number;
  live: boolean;
  /** Trecho do trajeto para desenhar no mapa. */
  path: LatLng[];
}

export interface WalkLeg {
  type: 'walk';
  from: { name: string; lat: number; lng: number };
  to: { name: string; lat: number; lng: number };
  distanceM: number;
  durationMin: number;
}

export type Leg = BusLeg | WalkLeg;

export interface Itinerary {
  id: string;
  departAt: string;
  arriveAt: string;
  /** US26 — tempo total estimado, da saída da origem à chegada no destino. */
  durationMin: number;
  walkMin: number;
  walkM: number;
  waitMin: number;
  rideMin: number;
  transfers: number;
  distanceM: number;
  tags: ('fastest' | 'least_walk' | 'fewest_transfers' | 'walk_only' | 'later')[];
  legs: Leg[];
}

interface Candidate {
  arrive: number;
  depart: number;
  walkM: number;
  transfers: number;
  sig: string;
  build: () => Leg[];
}

const stopRef = (s: NetStop) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng });

function busLeg(net: Network, line: NetLine, i: number, j: number, b: Boarding, readyAt: number): BusLeg {
  const from = net.stops.get(line.stops[i]!.stopId)!;
  const to = net.stops.get(line.stops[j]!.stopId)!;
  const path: LatLng[] = line.stops.slice(i, j + 1).map((ls) => {
    const s = net.stops.get(ls.stopId)!;
    return [s.lat, s.lng];
  });
  const ride = line.stops[j]!.offsetMin - line.stops[i]!.offsetMin;
  return {
    type: 'bus',
    line: { id: line.id, code: line.code, name: line.name, color: line.color },
    from: stopRef(from),
    to: stopRef(to),
    departAt: formatHHMM(b.at),
    arriveAt: formatHHMM(b.at + ride),
    waitMin: Math.max(0, Math.round(b.at - readyAt)),
    rideMin: ride,
    stopsCount: j - i,
    distanceM: Math.round(polylineLength(path)),
    delayMin: b.delayMin,
    live: b.live,
    path,
  };
}

const walkLeg = (from: { name: string; pos: LatLng }, to: { name: string; pos: LatLng }, walkM: number): WalkLeg => ({
  type: 'walk',
  from: { name: from.name, lat: from.pos[0], lng: from.pos[1] },
  to: { name: to.name, lat: to.pos[0], lng: to.pos[1] },
  distanceM: walkM,
  durationMin: Math.ceil(walkM / WALK_M_PER_MIN),
});

const tr = (c: Candidate) => Math.max(0, c.transfers);

/**
 * Fronteira de Pareto: descarta a opção que outra supera (ou empata) em chegada, baldeações, caminhada e
 * horário de saída (sair mais tarde para chegar na mesma hora é melhor). Ex.: pegar o 175E e trocar para o
 * mesmo ônibus 08 que dava para pegar direto. Ir a pé sempre fica: é a opção sem espera e sem passagem.
 * `list` deve vir ordenada por preferência (o empate total mantém a primeira).
 */
function paretoFront(list: Candidate[]): Candidate[] {
  return list.filter(
    (c, i) =>
      c.transfers < 0 ||
      !list.some(
        (d, j) =>
          d !== c &&
          d.arrive <= c.arrive &&
          tr(d) <= tr(c) &&
          d.walkM <= c.walkM &&
          d.depart >= c.depart &&
          (d.arrive < c.arrive || tr(d) < tr(c) || d.walkM < c.walkM || d.depart > c.depart || j < i),
      ),
  );
}

/** Melhores opções saindo a partir de `t0` (fronteira de Pareto). */
function search(net: Network, from: Place, to: Place, clock: Clock, extra: ExtraDelay, t0: number): Candidate[] {
  const origin = { name: labelOf(from), pos: posOf(from) };
  const dest = { name: labelOf(to), pos: posOf(to) };
  const originAccess = accessStops(net, from);
  const destAccess = new Map(accessStops(net, to).map((a) => [a.stop.id, a]));
  const tt = new Timetables(clock, extra);
  const lines = net.lines.filter((l) => l.status === 'active' && l.stops.length > 1);
  const candidates: Candidate[] = [];

  // Só a pé, quando é perto
  const straight = haversine(origin.pos, dest.pos);
  if (straight * WALK_DETOUR <= MAX_WALK_ONLY_M) {
    const walkM = Math.round(straight * WALK_DETOUR);
    const min = Math.ceil(walkM / WALK_M_PER_MIN);
    candidates.push({ arrive: t0 + min, depart: t0, walkM, transfers: -1, sig: 'walk', build: () => [walkLeg(origin, dest, walkM)] });
  }

  // Chegada mais cedo em cada parada usando uma linha só (para as baldeações)
  interface Reach {
    at: number;
    line: NetLine;
    i: number;
    j: number;
    b: Boarding;
    access: Access;
  }
  const firstLeg: Reach[] = [];

  for (const line of lines) {
    for (const acc of originAccess) {
      line.stops.forEach((ls, i) => {
        if (ls.stopId !== acc.stop.id || i === line.stops.length - 1) return;
        const b = tt.next(line, i, t0 + acc.walkMin);
        if (!b) return;
        for (let j = i + 1; j < line.stops.length; j++) {
          const at = b.at + (line.stops[j]!.offsetMin - line.stops[i]!.offsetMin);
          firstLeg.push({ at, line, i, j, b, access: acc });
          const d = destAccess.get(line.stops[j]!.stopId);
          if (!d) continue;
          const arrive = at + d.walkMin;
          candidates.push({
            arrive,
            depart: b.at - acc.walkMin,
            walkM: acc.walkM + d.walkM,
            transfers: 0,
            sig: `${line.id}`,
            build: () => {
              const toStop = net.stops.get(line.stops[j]!.stopId)!;
              const legs: Leg[] = [];
              if (acc.walkM > 0) legs.push(walkLeg(origin, { name: acc.stop.name, pos: [acc.stop.lat, acc.stop.lng] }, acc.walkM));
              // Saindo no horário sugerido, chega ao ponto junto com o ônibus: espera só na baldeação
              legs.push(busLeg(net, line, i, j, b, b.at));
              if (d.walkM > 0) legs.push(walkLeg({ name: toStop.name, pos: [toStop.lat, toStop.lng] }, dest, d.walkM));
              return legs;
            },
          });
        }
      });
    }
  }

  // Uma baldeação: desce da linha A na parada X, caminha até Y (pode ser a mesma), pega a linha B
  // Melhor chegada por (linha A, parada X) para não repetir combinações equivalentes
  const bestReach = new Map<string, Reach>();
  for (const r of firstLeg) {
    const key = `${r.line.id}:${r.line.stops[r.j]!.stopId}`;
    const cur = bestReach.get(key);
    // Mesma chegada: caminha menos e, em linha circular (passa 2× no ponto), embarca na passagem mais tarde
    const better =
      !cur ||
      r.at < cur.at ||
      (r.at === cur.at && (r.access.walkM < cur.access.walkM || (r.access.walkM === cur.access.walkM && r.b.at - r.access.walkMin > cur.b.at - cur.access.walkMin)));
    if (better) bestReach.set(key, r);
  }
  const stopsList = [...net.stops.values()];
  const nearCache = new Map<number, { stop: NetStop; walkM: number; walkMin: number }[]>();
  const transfersFrom = (x: NetStop) => {
    let list = nearCache.get(x.id);
    if (!list) {
      list = stopsList
        .map((s) => ({ stop: s, d: s.id === x.id ? 0 : haversine([x.lat, x.lng], [s.lat, s.lng]) }))
        .filter((s) => s.d <= MAX_TRANSFER_WALK_M)
        .map((s) => ({ stop: s.stop, walkM: Math.round(s.d * WALK_DETOUR), walkMin: s.d === 0 ? 0 : walkMinutes(s.d) }));
      nearCache.set(x.id, list);
    }
    return list;
  };

  for (const r of bestReach.values()) {
    const x = net.stops.get(r.line.stops[r.j]!.stopId)!;
    // Descer já no destino não precisa de baldeação
    if (destAccess.has(x.id)) continue;
    for (const y of transfersFrom(x)) {
      for (const lineB of net.linesByStop.get(y.stop.id) ?? []) {
        if (lineB.id === r.line.id || lineB.status !== 'active') continue;
        lineB.stops.forEach((ls, m) => {
          if (ls.stopId !== y.stop.id || m === lineB.stops.length - 1) return;
          const readyAt = r.at + y.walkMin + MIN_TRANSFER_MIN;
          const b2 = tt.next(lineB, m, readyAt);
          if (!b2) return;
          for (let j2 = m + 1; j2 < lineB.stops.length; j2++) {
            const d = destAccess.get(lineB.stops[j2]!.stopId);
            if (!d) continue;
            const arrive = b2.at + (lineB.stops[j2]!.offsetMin - ls.offsetMin) + d.walkMin;
            candidates.push({
              arrive,
              depart: r.b.at - r.access.walkMin,
              walkM: r.access.walkM + y.walkM + d.walkM,
              transfers: 1,
              sig: `${r.line.id}>${lineB.id}`,
              build: () => {
                const legs: Leg[] = [];
                const acc = r.access;
                const toStop = net.stops.get(lineB.stops[j2]!.stopId)!;
                if (acc.walkM > 0) legs.push(walkLeg(origin, { name: acc.stop.name, pos: [acc.stop.lat, acc.stop.lng] }, acc.walkM));
                legs.push(busLeg(net, r.line, r.i, r.j, r.b, r.b.at));
                if (y.walkM > 0) legs.push(walkLeg({ name: x.name, pos: [x.lat, x.lng] }, { name: y.stop.name, pos: [y.stop.lat, y.stop.lng] }, y.walkM));
                legs.push(busLeg(net, lineB, m, j2, b2, readyAt - MIN_TRANSFER_MIN));
                if (d.walkM > 0) legs.push(walkLeg({ name: toStop.name, pos: [toStop.lat, toStop.lng] }, dest, d.walkM));
                return legs;
              },
            });
          }
        });
      }
    }
  }

  if (!candidates.length) return [];

  // Melhor opção de cada combinação de linhas: chega antes; empate → caminha menos → sai mais tarde
  const bySig = new Map<string, Candidate>();
  for (const c of candidates) {
    const cur = bySig.get(c.sig);
    if (!cur || c.arrive < cur.arrive || (c.arrive === cur.arrive && (c.walkM < cur.walkM || (c.walkM === cur.walkM && c.depart > cur.depart)))) {
      bySig.set(c.sig, c);
    }
  }
  const best = [...bySig.values()].sort((a, b) => a.arrive - b.arrive || a.transfers - b.transfers || a.walkM - b.walkM);
  const front = paretoFront(best);
  const fastest = front[0]!.arrive;
  // Opções muito piores que a mais rápida não ajudam ninguém
  const pick = front.filter((c) => c.arrive <= fastest + (c.transfers < 0 ? 30 : 60)).slice(0, MAX_RESULTS);

  return pick;
}

/** Opções de viagem de `from` a `to` saindo agora (clock). Se houver poucas, inclui os próximos horários da melhor. */
export function planTrips(net: Network, from: Place, to: Place, clock: Clock, extra: ExtraDelay = new Map()): Itinerary[] {
  const pick = search(net, from, to, clock, extra, clock.nowMin);
  if (!pick.length) return [];
  const later = new Set<Candidate>();
  // "Sair mais tarde": a próxima partida da opção mais rápida (até completar 3 opções)
  let after = pick[0]!;
  for (let k = 0; k < 2 && pick.length + later.size < 3 && after.transfers >= 0; k++) {
    const next = search(net, from, to, clock, extra, after.depart + 1).find((c) => c.sig === after.sig && c.depart > after.depart);
    if (!next) break;
    later.add(next);
    after = next;
  }
  // Um horário "mais tarde" pode tornar outra opção dispensável (chega igual, saindo depois e sem baldeação)
  const all = paretoFront([...pick, ...later].sort((a, b) => a.arrive - b.arrive || tr(a) - tr(b) || a.walkM - b.walkM));
  const firstWith = (cmp: (a: Candidate, b: Candidate) => number) => [...all].sort(cmp)[0];
  const leastWalk = all.length > 1 ? firstWith((a, b) => a.walkM - b.walkM || a.arrive - b.arrive) : undefined;
  const fewest = all.length > 1 ? firstWith((a, b) => tr(a) - tr(b) || a.arrive - b.arrive) : undefined;

  return all.map((c, idx) => {
    const legs = c.build();
    const bus = legs.filter((l): l is BusLeg => l.type === 'bus');
    const walk = legs.filter((l): l is WalkLeg => l.type === 'walk');
    const tags: Itinerary['tags'] = [];
    if (c.transfers < 0) tags.push('walk_only');
    if (idx === 0) tags.push('fastest');
    if (later.has(c)) tags.push('later');
    if (c === leastWalk && idx !== 0) tags.push('least_walk');
    if (c === fewest && idx !== 0 && tr(c) < tr(all[0]!)) tags.push('fewest_transfers');
    const walkMin = walk.reduce((a, l) => a + l.durationMin, 0);
    const rideMin = bus.reduce((a, l) => a + l.rideMin, 0);
    return {
      id: `${c.sig}@${Math.round(c.depart)}`,
      departAt: formatHHMM(c.depart),
      arriveAt: formatHHMM(c.arrive),
      durationMin: Math.round(c.arrive - c.depart),
      walkMin,
      walkM: c.walkM,
      waitMin: bus.reduce((a, l) => a + l.waitMin, 0),
      rideMin,
      transfers: Math.max(0, bus.length - 1),
      distanceM: bus.reduce((a, l) => a + l.distanceM, 0) + c.walkM,
      tags,
      legs,
    };
  });
}
