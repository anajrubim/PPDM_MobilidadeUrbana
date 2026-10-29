import type { LatLng } from '../../lib/geo.js';
import type { NetLine, Network } from '../transit/network.js';
import { DEFAULT_TZ, formatHHMM, isOperating, minutesOfDay, serviceDepartures } from '../transit/schedule.js';

/**
 * US16 — "tempo real" simulado.
 *
 * A rede de demonstração não tem GPS embarcado. Cada partida da programação vira uma viagem com um atraso
 * determinístico (mesma linha + dia + horário → mesmo atraso), somado ao atraso dos avisos de serviço
 * ativos (ex.: obra na via). A posição do ônibus é interpolada entre as paradas pelo tempo decorrido.
 * Trocar por um feed real (GTFS-Realtime/AVL) só exige outra implementação de `tripInstances` (RNF10).
 */

const DAY = 1440;

export interface Clock {
  /** Minutos desde a meia-noite local de hoje (fuso da operação). */
  nowMin: number;
  /** Data local de hoje (AAAA-MM-DD). */
  today: string;
  /** Instante de "agora" (ms) — para converter minutos previstos em horário exato. */
  epochMs?: number;
}

export function clockFor(date: Date, tz = DEFAULT_TZ): Clock {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  return { nowMin: minutesOfDay(date, tz), today, epochMs: date.getTime() };
}

/** Soma dias a uma data AAAA-MM-DD. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** FNV-1a de 32 bits: espalha bem e é estável entre execuções. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Atraso simulado da viagem: 60% no horário, 25% 1–3 min, 12% 4–7 min, 3% 8–12 min. */
export function simulatedDelay(lineCode: string, serviceDate: string, departureMin: number): number {
  const r = hash(`${lineCode}|${serviceDate}|${departureMin}`) % 100;
  if (r < 60) return 0;
  if (r < 85) return 1 + (r % 3);
  if (r < 97) return 4 + (r % 4);
  return 8 + (r % 5);
}

export interface TripInstance {
  /** Identificador estável: linha:data:partida. */
  id: string;
  line: NetLine;
  serviceDate: string;
  /** Partida programada do ponto inicial, em minutos relativos à meia-noite de hoje (pode ser negativo/maior que 1440). */
  startMin: number;
  delayMin: number;
  /** A viagem já saiu do ponto inicial (pelo horário com atraso)? */
  started: boolean;
  /** Ainda não chegou ao ponto final? */
  running: boolean;
}

/** Atraso extra por linha vindo dos avisos de serviço ativos. */
export type ExtraDelay = Map<number, number>;

/**
 * Viagens de uma linha relevantes perto de agora: as de ontem (madrugada), hoje e amanhã.
 * `horizonMin` limita as futuras (padrão: 6 h).
 */
export function tripInstances(line: NetLine, clock: Clock, extra: ExtraDelay = new Map(), horizonMin = 360): TripInstance[] {
  if (!isOperating(line) || line.stops.length < 2) return [];
  const duration = line.stops.at(-1)!.offsetMin;
  const out: TripInstance[] = [];
  for (const shift of [-1, 0, 1]) {
    const serviceDate = addDays(clock.today, shift);
    for (const dep of serviceDepartures(line)) {
      const startMin = dep + shift * DAY;
      if (startMin + duration + 30 < clock.nowMin || startMin > clock.nowMin + horizonMin) continue;
      const delayMin = simulatedDelay(line.code, serviceDate, dep) + (extra.get(line.id) ?? 0);
      const started = startMin + delayMin <= clock.nowMin;
      out.push({
        id: `${line.id}:${serviceDate}:${dep}`,
        line,
        serviceDate,
        startMin,
        delayMin,
        started,
        running: started && clock.nowMin <= startMin + delayMin + duration,
      });
    }
  }
  return out.sort((a, b) => a.startMin - b.startMin);
}

export interface Vehicle {
  id: string;
  lineId: number;
  lineCode: string;
  color: string;
  lat: number;
  lng: number;
  /** Rumo em graus (0 = norte), para girar o ícone. */
  heading: number;
  delayMin: number;
  /** Partida programada do ponto inicial (HH:MM). */
  departedAt: string;
  /** Próxima parada (ainda não alcançada). */
  nextStop: { id: number; name: string; seq: number; inMin: number } | null;
  /** 0 a 1: quanto do trajeto já foi percorrido. */
  progress: number;
}

function bearing(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(b[1] - a[1])) * Math.cos(toRad(b[0]));
  const x = Math.cos(toRad(a[0])) * Math.sin(toRad(b[0])) - Math.sin(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.cos(toRad(b[1] - a[1]));
  return Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
}

/** Posição do ônibus de uma viagem em andamento, interpolada entre as paradas. */
export function vehicleOf(net: Network, trip: TripInstance, clock: Clock): Vehicle | null {
  if (!trip.running) return null;
  const { line } = trip;
  const elapsed = clock.nowMin - (trip.startMin + trip.delayMin);
  const stops = line.stops;
  let i = 0;
  while (i < stops.length - 2 && stops[i + 1]!.offsetMin <= elapsed) i++;
  const a = stops[i]!;
  const b = stops[i + 1]!;
  const span = Math.max(1e-6, b.offsetMin - a.offsetMin);
  const f = Math.min(1, Math.max(0, (elapsed - a.offsetMin) / span));
  const sa = net.stops.get(a.stopId)!;
  const sb = net.stops.get(b.stopId)!;
  const pa: LatLng = [sa.lat, sa.lng];
  const pb: LatLng = [sb.lat, sb.lng];
  const next = f >= 1 ? stops[i + 2] : b;
  const nextStop = next ? net.stops.get(next.stopId)! : null;
  const total = stops.at(-1)!.offsetMin || 1;
  return {
    id: trip.id,
    lineId: line.id,
    lineCode: line.code,
    color: line.color,
    lat: Math.round((pa[0] + (pb[0] - pa[0]) * f) * 1e6) / 1e6,
    lng: Math.round((pa[1] + (pb[1] - pa[1]) * f) * 1e6) / 1e6,
    heading: bearing(pa, pb),
    delayMin: trip.delayMin,
    departedAt: formatHHMM(trip.startMin),
    nextStop:
      next && nextStop
        ? { id: nextStop.id, name: nextStop.name, seq: next.seq, inMin: Math.max(0, Math.round(next.offsetMin - elapsed)) }
        : null,
    progress: Math.round(Math.min(1, Math.max(0, elapsed / total)) * 1000) / 1000,
  };
}

export function vehiclesOfLine(net: Network, line: NetLine, clock: Clock, extra?: ExtraDelay): Vehicle[] {
  return tripInstances(line, clock, extra).flatMap((t) => {
    const v = vehicleOf(net, t, clock);
    return v ? [v] : [];
  });
}

export interface Prediction {
  inMin: number;
  /** Horário previsto (com atraso). */
  at: string;
  /** Horário da programação. */
  scheduledAt: string;
  delayMin: number;
  /** true = ônibus já em circulação (previsão "ao vivo"); false = só programação. */
  live: boolean;
  tripId: string;
  /** Instante previsto da chegada (ISO, com segundos) — base da contagem regressiva do app. */
  etaAt?: string;
}

/**
 * US09 + US16 — próximas passagens de uma linha numa parada.
 * Viagens já em circulação usam o atraso atual; as que ainda não saíram, a programação
 * (somada ao atraso de um aviso de serviço, se houver).
 */
export function predictedArrivals(line: NetLine, stopId: number, clock: Clock, count = 3, extra?: ExtraDelay): Prediction[] {
  const passages = line.stops.filter((s) => s.stopId === stopId);
  if (!passages.length) return [];
  const known = extra?.get(line.id) ?? 0;
  const out: Prediction[] = [];
  for (const trip of tripInstances(line, clock, extra, 1440)) {
    const delay = trip.started ? trip.delayMin : known;
    for (const p of passages) {
      const scheduled = trip.startMin + p.offsetMin;
      const predicted = scheduled + delay;
      if (predicted < clock.nowMin) continue;
      out.push({
        inMin: Math.max(0, Math.round(predicted - clock.nowMin)),
        at: formatHHMM(predicted),
        scheduledAt: formatHHMM(scheduled),
        delayMin: delay,
        live: trip.started,
        tripId: trip.id,
        ...(clock.epochMs != null ? { etaAt: new Date(clock.epochMs + (predicted - clock.nowMin) * 60_000).toISOString() } : {}),
      });
    }
  }
  return out.sort((a, b) => a.inMin - b.inMin).slice(0, count);
}
