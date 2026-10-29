import type { LatLng } from '../../lib/geo';

export interface MapPath {
  id: string;
  coords: LatLng[];
  color: string;
}

export interface MapPoint {
  id: string;
  coord: LatLng;
  /** stop = ponto de parada; highlight = ponto em destaque (ex.: a parada aberta); vehicle = ônibus ao vivo (US16). */
  kind: 'stop' | 'highlight' | 'vehicle';
  label?: string;
  color?: string;
  /** Ônibus: número da linha no ícone e rumo (graus). */
  badge?: string;
  heading?: number;
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
  /** US28 — quantos tiles vieram do cache do aparelho e quantos da rede. */
  onTileStats?: (s: { cached: number; network: number }) => void;
  /** US28 — mudar este número apaga o cache de tiles do aparelho. */
  clearTilesKey?: number;
}

/** Estado enviado para dentro do mapa (WebView no celular, iframe no navegador). */
export interface MapState {
  paths: { id: string; color: string; coords: [number, number][] }[];
  points: { id: string; kind: MapPoint['kind']; label?: string; color?: string; badge?: string; heading?: number; coord: [number, number] }[];
  user: [number, number] | null;
  fit: [number, number][];
  /** Muda quando o conteúdo muda de verdade — só então o mapa reenquadra. */
  fitKey: string;
}

export type MapCommand = { type: 'state'; state: MapState } | { type: 'locate' } | { type: 'clearTiles' };
export type MapEvent =
  | { type: 'ready' }
  | { type: 'point'; id: string }
  | { type: 'tiles'; ok: boolean }
  /** US28 — tiles servidos do cache do aparelho / baixados nesta sessão. */
  | { type: 'tileStats'; cached: number; network: number };
