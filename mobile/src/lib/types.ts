export type ServiceType = 'normal' | 'executivo' | 'noturno' | 'expresso';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
  createdAt: string;
}

export interface Session {
  token: string;
  user: User;
}

export interface LineSummary {
  id: number;
  code: string;
  name: string;
  origin: string;
  destination: string;
  mode: string;
  serviceType: ServiceType;
  status: 'active' | 'inactive';
  color: string;
  headwayMin: number;
  firstDeparture: string;
  lastDeparture: string;
  stopsCount: number;
  operating: boolean;
  isFavorite: boolean;
}

export interface Arrival {
  inMin: number;
  at: string;
}

export interface LineStop {
  id: number;
  code: string;
  name: string;
  lat: number;
  lng: number;
  seq: number;
  offsetMin: number;
  linesCount: number;
  nextArrival: Arrival | null;
}

export interface LineDetail extends LineSummary {
  shape: [number, number][];
  lengthM: number;
  durationMin: number;
  stops: LineStop[];
}

export interface StopSummary {
  id: number;
  code: string;
  name: string;
  lat: number;
  lng: number;
  lines: string[];
  distanceM: number | null;
}

export interface StopLine {
  id: number;
  code: string;
  name: string;
  color: string;
  serviceType: ServiceType;
  firstDeparture: string;
  lastDeparture: string;
  headwayMin: number;
  arrivals: Arrival[];
  timetable: string[];
}

export interface StopDetail {
  id: number;
  code: string;
  name: string;
  lat: number;
  lng: number;
  lines: StopLine[];
}

export interface Trip {
  id: string;
  lineId: number | null;
  lineCode: string;
  originLabel: string;
  destLabel: string;
  durationMin: number;
  distanceM: number;
  createdAt: string;
}

export interface Dashboard {
  favorites: LineSummary[];
  nextDepartures: (Arrival & { line: { id: number; code: string; name: string; color: string }; stop: { id: number; name: string } })[];
  trips: {
    last30Days: { trips: number; minutes: number; distance: number };
    total: number;
    mostUsedLine: string | null;
    recent: Trip[];
  };
}
