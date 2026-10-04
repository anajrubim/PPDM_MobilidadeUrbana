import type { Queryable } from '../../db/pool.js';
import type { LatLng } from '../../lib/geo.js';

export type ServiceType = 'normal' | 'executivo' | 'noturno' | 'expresso';
export type LineStatus = 'active' | 'inactive';

export interface NetStop {
  id: number;
  code: string;
  name: string;
  lat: number;
  lng: number;
}

export interface NetLineStop {
  stopId: number;
  seq: number;
  offsetMin: number;
}

export interface NetLine {
  id: number;
  code: string;
  name: string;
  origin: string;
  destination: string;
  mode: string;
  serviceType: ServiceType;
  status: LineStatus;
  color: string;
  headwayMin: number;
  firstDeparture: string;
  lastDeparture: string;
  shape: LatLng[];
  stops: NetLineStop[];
}

export interface Network {
  lines: NetLine[];
  lineById: Map<number, NetLine>;
  stops: Map<number, NetStop>;
  linesByStop: Map<number, NetLine[]>;
}

export function buildNetwork(lines: NetLine[], stops: NetStop[]): Network {
  const linesByStop = new Map<number, NetLine[]>();
  for (const line of lines) {
    line.stops.sort((a, b) => a.seq - b.seq);
    for (const ls of line.stops) {
      const list = linesByStop.get(ls.stopId) ?? [];
      // Uma linha circular passa duas vezes pela mesma parada: registra a linha uma única vez
      if (!list.some((l) => l.id === line.id)) list.push(line);
      linesByStop.set(ls.stopId, list);
    }
  }
  return {
    lines,
    lineById: new Map(lines.map((l) => [l.id, l])),
    stops: new Map(stops.map((s) => [s.id, s])),
    linesByStop,
  };
}

interface LineRow {
  id: number;
  code: string;
  name: string;
  origin: string;
  destination: string;
  mode: string;
  service_type: ServiceType;
  status: LineStatus;
  color: string;
  headway_min: number;
  first_departure: string;
  last_departure: string;
  shape: LatLng[];
}
interface LineStopRow {
  line_id: number;
  stop_id: number;
  seq: number;
  offset_min: number;
}

/** Carrega a rede do banco. Fica em memória (NetworkCache) para responder rápido (RNF4). */
export async function loadNetwork(db: Queryable): Promise<Network> {
  const [lines, lineStops, stops] = await Promise.all([
    db.query<LineRow>(
      `SELECT id, code, name, origin, destination, mode, service_type, status, color,
              headway_min, first_departure, last_departure, shape FROM lines ORDER BY code`,
    ),
    db.query<LineStopRow>('SELECT line_id, stop_id, seq, offset_min FROM line_stops'),
    db.query<NetStop>('SELECT id, code, name, lat, lng FROM stops'),
  ]);
  const byLine = new Map<number, NetLineStop[]>();
  for (const r of lineStops.rows) {
    const list = byLine.get(r.line_id) ?? [];
    list.push({ stopId: r.stop_id, seq: r.seq, offsetMin: r.offset_min });
    byLine.set(r.line_id, list);
  }
  return buildNetwork(
    lines.rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      origin: r.origin,
      destination: r.destination,
      mode: r.mode,
      serviceType: r.service_type,
      status: r.status,
      color: r.color,
      headwayMin: r.headway_min,
      firstDeparture: r.first_departure,
      lastDeparture: r.last_departure,
      shape: r.shape,
      stops: byLine.get(r.id) ?? [],
    })),
    stops.rows,
  );
}

export class NetworkCache {
  private current: Promise<Network> | null = null;
  constructor(private readonly db: Queryable) {}
  get(): Promise<Network> {
    if (!this.current) {
      const pending = loadNetwork(this.db);
      this.current = pending;
      // Falhou? Descarta para a próxima chamada tentar de novo (só se ainda for a carga vigente)
      pending.catch(() => {
        if (this.current === pending) this.current = null;
      });
    }
    return this.current;
  }
  invalidate(): void {
    this.current = null;
  }
}
