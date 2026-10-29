import type { Arrival } from './types';

/**
 * US27 — previsões calculadas no aparelho, a partir da programação salva (mesmo algoritmo da API:
 * partidas do ponto inicial a cada `headwayMin` entre o primeiro e o último horário, mais o tempo até a parada).
 * Usado quando não há internet ou os dados salvos estão velhos. Não considera atrasos.
 */
const DAY = 1440;

export const parseHHMM = (v: string) => {
  const [h, m] = v.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

export function formatHHMM(min: number): string {
  const m = ((Math.round(min) % DAY) + DAY) % DAY;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Minutos desde a meia-noite em São Paulo (fuso da operação), independentemente do fuso do aparelho. */
export function minutesOfDay(date = new Date(), tz = 'America/Sao_Paulo'): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    return get('hour') * 60 + get('minute') + date.getSeconds() / 60;
  } catch {
    // Motor JS sem suporte a fusos: usa o horário do aparelho
    return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
  }
}

export interface ScheduleLine {
  firstDeparture: string;
  lastDeparture: string;
  headwayMin: number;
}

export function departures(line: ScheduleLine): number[] {
  const first = parseHHMM(line.firstDeparture);
  let last = parseHHMM(line.lastDeparture);
  if (last < first) last += DAY;
  const out: number[] = [];
  for (let t = first; t <= last && line.headwayMin > 0; t += line.headwayMin) out.push(t);
  return out;
}

/** Próximas passagens numa parada (offsets = minutos do ponto inicial até ela; mais de um em linha circular). */
export function offlineArrivals(line: ScheduleLine, offsets: number[], nowMin: number, count = 3): Arrival[] {
  if (!offsets.length) return [];
  const base = departures(line);
  const times: number[] = [];
  for (const shift of [-DAY, 0, DAY]) for (const d of base) for (const o of offsets) times.push(d + shift + o);
  return times
    .filter((t) => t >= nowMin)
    .sort((a, b) => a - b)
    .slice(0, count)
    .map((t) => ({ inMin: Math.max(0, Math.round(t - nowMin)), at: formatHHMM(t), scheduledAt: formatHHMM(t), delayMin: 0, live: false, offline: true }));
}
