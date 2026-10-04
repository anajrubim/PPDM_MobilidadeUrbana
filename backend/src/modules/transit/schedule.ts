import type { NetLine } from './network.js';

const DAY = 1440;
export const DEFAULT_TZ = 'America/Sao_Paulo';

export function parseHHMM(v: string): number {
  const [h, m] = v.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function formatHHMM(min: number): string {
  const m = ((Math.round(min) % DAY) + DAY) % DAY;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Minutos (fracionários) desde a meia-noite local do fuso informado. */
export function minutesOfDay(date: Date, tz = DEFAULT_TZ): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get('hour') * 60 + get('minute') + get('second') / 60;
}

/** Partidas do ponto inicial num dia de operação (suporta madrugada: último < primeiro). */
export function serviceDepartures(line: Pick<NetLine, 'firstDeparture' | 'lastDeparture' | 'headwayMin'>): number[] {
  const first = parseHHMM(line.firstDeparture);
  let last = parseHHMM(line.lastDeparture);
  if (last < first) last += DAY;
  const deps: number[] = [];
  for (let t = first; t <= last; t += line.headwayMin) deps.push(t);
  return deps;
}

export function isOperating(line: Pick<NetLine, 'status'>): boolean {
  return line.status === 'active';
}

export interface Arrival {
  inMin: number;
  at: string;
}

/**
 * US09 — próximos horários previstos de uma linha numa parada, pela programação
 * (partida do ponto inicial + tempo até a parada). Considera ontem/hoje/amanhã para virar a meia-noite.
 */
export function nextArrivalsAtStop(line: NetLine, stopId: number, nowMin: number, count = 3): Arrival[] {
  // Linha circular passa mais de uma vez pela mesma parada: considera todas as passagens
  const passages = line.stops.filter((s) => s.stopId === stopId);
  if (passages.length === 0) return [];
  const base = serviceDepartures(line);
  const arrivals: number[] = [];
  for (const shift of [-DAY, 0, DAY]) {
    for (const dep of base) for (const p of passages) arrivals.push(dep + shift + p.offsetMin);
  }
  return arrivals
    .filter((a) => a >= nowMin)
    .sort((a, b) => a - b)
    .slice(0, count)
    .map((a) => ({ inMin: Math.max(0, Math.round(a - nowMin)), at: formatHHMM(a) }));
}

/** Horários do dia de uma linha numa parada (tabela completa, US09). */
export function timetableAtStop(line: NetLine, stopId: number): string[] {
  const passages = line.stops.filter((s) => s.stopId === stopId);
  const times = serviceDepartures(line).flatMap((dep) => passages.map((p) => dep + p.offsetMin));
  return [...new Set(times.sort((a, b) => a - b).map(formatHHMM))];
}
