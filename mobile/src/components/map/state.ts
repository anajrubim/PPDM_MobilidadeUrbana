import { framingPoints, type LatLng } from '../../lib/geo';
import type { MapState, TransitMapProps } from './types';

const pair = (c: LatLng): [number, number] => [c.latitude, c.longitude];

/** Converte as props do componente no estado serializável que o mapa (Leaflet) desenha. */
export function toMapState({ paths = [], points = [], user, fitTo }: TransitMapProps): MapState {
  const content = [...paths.flatMap((p) => p.coords), ...points.map((p) => p.coord)];
  const fit = fitTo ?? framingPoints(content, user);
  // A posição do usuário entra na chave só quando é ela que define o enquadramento (sem trajeto/pontos)
  const fitKey = fitTo
    ? `fit:${fitTo.map((c) => `${c.latitude.toFixed(4)},${c.longitude.toFixed(4)}`).join(';')}`
    : `${paths.map((p) => p.id).join(',')}|${points.map((p) => p.id).join(',')}|${content.length === 0 && user ? 'user' : ''}`;
  return {
    paths: paths.filter((p) => p.coords.length > 1).map((p) => ({ id: p.id, color: p.color, coords: p.coords.map(pair) })),
    points: points.map((p) => ({ id: p.id, kind: p.kind, label: p.label, color: p.color, coord: pair(p.coord) })),
    user: user ? pair(user) : null,
    fit: fit.map(pair),
    fitKey,
  };
}
