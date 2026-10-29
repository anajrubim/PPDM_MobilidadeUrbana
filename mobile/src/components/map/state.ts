import { useMemo } from 'react';
import { framingPoints, type LatLng } from '../../lib/geo';
import type { MapState, TransitMapProps } from './types';

const pair = (c: LatLng): [number, number] => [c.latitude, c.longitude];

/** Converte as props do componente no estado serializável que o mapa (Leaflet) desenha. */
export function toMapState({ paths = [], points = [], user, fitTo }: TransitMapProps): MapState {
  const content = [...paths.flatMap((p) => p.coords), ...points.filter((p) => p.kind !== 'vehicle').map((p) => p.coord)];
  const fit = fitTo ?? framingPoints(content, user);
  // Ônibus andando não reenquadram o mapa (só trajeto e paradas definem o enquadramento)
  const framing = points.filter((p) => p.kind !== 'vehicle');
  // A posição do usuário entra na chave só quando é ela que define o enquadramento (sem trajeto/pontos)
  const fitKey = fitTo
    ? `fit:${fitTo.map((c) => `${c.latitude.toFixed(4)},${c.longitude.toFixed(4)}`).join(';')}`
    : `${paths.map((p) => p.id).join(',')}|${framing.map((p) => p.id).join(',')}|${content.length === 0 && user ? 'user' : ''}`;
  return {
    paths: paths.filter((p) => p.coords.length > 1).map((p) => ({ id: p.id, color: p.color, coords: p.coords.map(pair) })),
    points: points.map((p) => ({ id: p.id, kind: p.kind, label: p.label, color: p.color, badge: p.badge, heading: p.heading, coord: pair(p.coord) })),
    user: user ? pair(user) : null,
    fit: fit.map(pair),
    fitKey,
  };
}

/**
 * Estado do mapa estável entre renders: só muda (e só é reenviado ao Leaflet) quando o conteúdo muda de verdade.
 * Telas que re-renderizam a cada segundo (contagem regressiva) não redesenham o mapa inteiro.
 */
export function useMapState({ paths, points, user, fitTo }: TransitMapProps): MapState {
  const json = JSON.stringify(toMapState({ paths, points, user, fitTo }));
  return useMemo(() => JSON.parse(json) as MapState, [json]);
}
