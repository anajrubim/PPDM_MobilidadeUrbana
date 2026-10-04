import type { LatLng } from '../../lib/geo';

export interface MapPath {
  id: string;
  coords: LatLng[];
  color: string;
}

export interface MapPoint {
  id: string;
  coord: LatLng;
  /** stop = ponto de parada; highlight = ponto em destaque (ex.: a parada aberta). */
  kind: 'stop' | 'highlight';
  label?: string;
  color?: string;
}

export interface TransitMapProps {
  paths?: MapPath[];
  points?: MapPoint[];
  /** US10 — posição atual do usuário (ponto azul). */
  user?: LatLng | null;
  /** Enquadra estes pontos (padrão: trajetos + pontos + usuário, se estiver perto). */
  fitTo?: LatLng[];
  height?: number;
  onPointPress?: (id: string) => void;
  /** Mostra o botão "centralizar em mim". */
  showLocateButton?: boolean;
}

/** Estado enviado para dentro do mapa (WebView no celular, iframe no navegador). */
export interface MapState {
  paths: { id: string; color: string; coords: [number, number][] }[];
  points: { id: string; kind: MapPoint['kind']; label?: string; color?: string; coord: [number, number] }[];
  user: [number, number] | null;
  fit: [number, number][];
  /** Muda quando o conteúdo muda de verdade — só então o mapa reenquadra. */
  fitKey: string;
}

export type MapCommand = { type: 'state'; state: MapState } | { type: 'locate' };
export type MapEvent = { type: 'ready' } | { type: 'point'; id: string } | { type: 'tiles'; ok: boolean };
