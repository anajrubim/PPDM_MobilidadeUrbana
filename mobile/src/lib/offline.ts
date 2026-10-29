import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';
import { keyFor, queryClient } from './query';
import type { LineDetail, LineSummary, StopDetail, StopSummary } from './types';

/** Caminhos que as telas usam e que ficam salvos para uso offline (mesmas chaves do cache). */
export const OFFLINE_PATHS = {
  lines: '/lines',
  stops: '/stops?sort=name&limit=300',
  line: (id: number) => `/lines/${id}`,
  stop: (id: number) => `/stops/${id}`,
};

const SAVED_AT_KEY = 'dmr.offline.savedAt';

export interface DownloadProgress {
  done: number;
  total: number;
}

/**
 * US27 — baixa todas as linhas, trajetos, paradas e horários para o cache do aparelho.
 * Depois disso o app mostra linhas, paradas e próximos horários (calculados no aparelho) sem internet.
 */
export async function downloadForOffline(onProgress?: (p: DownloadProgress) => void): Promise<{ lines: number; stops: number }> {
  const put = <T>(path: string, data: T) => queryClient.setQueryData(keyFor(path), data);
  const lines = await api.get<LineSummary[]>(OFFLINE_PATHS.lines);
  put(OFFLINE_PATHS.lines, lines);
  const stops = await api.get<StopSummary[]>(OFFLINE_PATHS.stops);
  put(OFFLINE_PATHS.stops, stops);
  const jobs = [...lines.map((l) => OFFLINE_PATHS.line(l.id)), ...stops.map((s) => OFFLINE_PATHS.stop(s.id))];
  let done = 0;
  onProgress?.({ done, total: jobs.length });
  // Poucas requisições por vez: não sobrecarrega a API nem a rede do celular
  const queue = [...jobs];
  const worker = async () => {
    for (let path = queue.shift(); path; path = queue.shift()) {
      put(path, await api.get<LineDetail | StopDetail>(path));
      onProgress?.({ done: ++done, total: jobs.length });
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  await AsyncStorage.setItem(SAVED_AT_KEY, new Date().toISOString());
  return { lines: lines.length, stops: stops.length };
}

export async function offlineSavedAt(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(SAVED_AT_KEY);
  } catch {
    return null;
  }
}

export async function forgetOfflineDownload(): Promise<void> {
  await AsyncStorage.removeItem(SAVED_AT_KEY).catch(() => undefined);
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

/** Busca de linhas no aparelho (offline), com a mesma ordem da API: número exato, começa com, contém. */
export function searchLinesOffline(all: LineSummary[] | undefined, q: string, serviceType?: string): LineSummary[] | undefined {
  if (!all) return undefined;
  const term = norm(q);
  const rank = (l: LineSummary) => (!term ? 0 : norm(l.code) === term ? 0 : norm(l.code).startsWith(term) ? 1 : 2);
  return all
    .filter((l) => (!serviceType || l.serviceType === serviceType) && (!term || norm(`${l.code} ${l.name} ${l.origin} ${l.destination}`).includes(term)))
    .sort((a, b) => rank(a) - rank(b) || a.code.localeCompare(b.code, 'pt-BR', { numeric: true }));
}

/** Paradas no aparelho (offline): filtra por nome/código e ordena por nome, distância ou nº de linhas. */
export function searchStopsOffline(
  all: StopSummary[] | undefined,
  q: string,
  sort: 'name' | 'distance' | 'lines',
  here?: { latitude: number; longitude: number } | null,
): StopSummary[] | undefined {
  if (!all) return undefined;
  const term = norm(q);
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dist = (s: StopSummary) => {
    if (!here) return null;
    const dLat = rad(s.lat - here.latitude);
    const dLng = rad(s.lng - here.longitude);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(here.latitude)) * Math.cos(rad(s.lat)) * Math.sin(dLng / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))));
  };
  const list = all.filter((s) => !term || norm(`${s.name} ${s.code}`).includes(term)).map((s) => ({ ...s, distanceM: dist(s) }));
  if (sort === 'distance' && here) list.sort((a, b) => a.distanceM! - b.distanceM!);
  else if (sort === 'lines') list.sort((a, b) => b.lines.length - a.lines.length || a.name.localeCompare(b.name, 'pt-BR'));
  else list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return list;
}
