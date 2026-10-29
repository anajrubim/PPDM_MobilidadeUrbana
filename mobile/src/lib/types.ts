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

export interface RatingSummary {
  average: number | null;
  count: number;
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
  rating: RatingSummary;
}

export interface Arrival {
  inMin: number;
  /** Horário previsto (com atraso, US16). */
  at: string;
  /** Horário da programação. */
  scheduledAt?: string;
  delayMin?: number;
  /** true = ônibus em circulação (previsão ao vivo). */
  live?: boolean;
  tripId?: string;
  /** Instante previsto (ISO, com segundos) — contagem regressiva do "Ao vivo". */
  etaAt?: string;
  /** Calculado no aparelho, sem internet (US27). */
  offline?: boolean;
}

export type AlertKind = 'delay' | 'detour' | 'suspension';

export interface ServiceAlert {
  id: number;
  lineId: number;
  kind: AlertKind;
  title: string;
  message: string;
  extraDelayMin: number;
  startsAt: string;
  endsAt: string;
  active: boolean;
  line?: { id: number; code: string; name: string; color: string };
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
  vehiclesCount: number;
  alerts: ServiceAlert[];
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
  /** Minutos desde o ponto inicial até esta parada (base do cálculo offline). */
  offsets: number[];
  alerts: ServiceAlert[];
}

export interface StopDetail {
  id: number;
  code: string;
  name: string;
  lat: number;
  lng: number;
  lines: StopLine[];
}

export interface TripLeg {
  lineId: number;
  lineCode: string;
  originStopId: number;
  destStopId: number;
  originLabel: string;
  destLabel: string;
  durationMin: number;
  distanceM: number;
}

export interface Trip {
  id: string;
  kind: 'planned' | 'completed';
  lineId: number | null;
  lineCode: string;
  originLabel: string;
  destLabel: string;
  durationMin: number;
  distanceM: number;
  walkMin: number;
  transfers: number;
  legs: TripLeg[];
  completedAt: string | null;
  createdAt: string;
}

export interface TripsPage {
  data: Trip[];
  meta: { nextBefore: string | null; summary: { trips: number; planned: number; minutes: number; distance: number } };
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
  unreadNotifications: number;
  alerts: ServiceAlert[];
}

// ---------- Sprint 2 ----------

export interface Vehicle {
  id: string;
  lineId: number;
  lineCode: string;
  color: string;
  lat: number;
  lng: number;
  heading: number;
  delayMin: number;
  departedAt: string;
  nextStop: { id: number; name: string; seq: number; inMin: number } | null;
  progress: number;
}

export interface LiveLine {
  line: { id: number; code: string; name: string; color: string };
  updatedAt: string;
  vehicles: Vehicle[];
  stop: { id: number; name: string; lat: number; lng: number; arrivals: Arrival[] } | null;
  alerts: ServiceAlert[];
}

export interface PlanPlace {
  stopId?: number;
  name: string;
  lat: number;
  lng: number;
}

export interface BusLeg {
  type: 'bus';
  line: { id: number; code: string; name: string; color: string };
  from: { id: number; name: string; lat: number; lng: number };
  to: { id: number; name: string; lat: number; lng: number };
  departAt: string;
  arriveAt: string;
  waitMin: number;
  rideMin: number;
  stopsCount: number;
  distanceM: number;
  delayMin: number;
  live: boolean;
  path: [number, number][];
}

export interface WalkLeg {
  type: 'walk';
  from: { name: string; lat: number; lng: number };
  to: { name: string; lat: number; lng: number };
  distanceM: number;
  durationMin: number;
}

export type PlanTag = 'fastest' | 'least_walk' | 'fewest_transfers' | 'walk_only' | 'later';

export interface PlanOption {
  id: string;
  departAt: string;
  arriveAt: string;
  durationMin: number;
  walkMin: number;
  walkM: number;
  waitMin: number;
  rideMin: number;
  transfers: number;
  distanceM: number;
  tags: PlanTag[];
  legs: (BusLeg | WalkLeg)[];
}

export interface PlanResult {
  from: PlanPlace;
  to: PlanPlace;
  at: string;
  options: PlanOption[];
}

export type NotificationType = 'delay' | 'service_alert' | 'proximity' | 'report' | 'share' | 'system';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  lineId: number | null;
  stopId: number | null;
  data: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

export interface NotificationList {
  items: AppNotification[];
  unread: number;
}

export interface NotificationSettings {
  delays: boolean;
  serviceAlerts: boolean;
  proximity: boolean;
}

export interface ProximityAlert {
  id: string;
  line: { id: number; code: string; name: string; color: string };
  stop: { id: number; name: string };
  minutesBefore: number;
  windowStart: string | null;
  windowEnd: string | null;
  active: boolean;
  nextArrival: Arrival | null;
  createdAt: string;
}

export interface Rating {
  score: number;
  comment: string | null;
  author: string;
  mine: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LineRatings {
  line: { id: number; code: string; name: string };
  summary: RatingSummary & { distribution: Record<'1' | '2' | '3' | '4' | '5', number> };
  mine: Rating | null;
  items: Rating[];
}

export type ReportCategory = 'overcrowding' | 'delay' | 'vehicle' | 'driver' | 'cleanliness' | 'safety' | 'stop' | 'other';

export interface Report {
  id: string;
  protocol?: string;
  line: { id: number; code: string; name: string; color: string } | null;
  stop: { id: number; name: string } | null;
  category: ReportCategory;
  categoryLabel: string;
  description: string | null;
  status: 'received' | 'in_review' | 'resolved' | 'dismissed';
  people: number;
  supportedByMe: boolean;
  mine: boolean;
  createdAt: string;
}

export interface LineReports {
  line: { id: number; code: string; name: string };
  days: number;
  total: number;
  summary: { category: ReportCategory; label: string; reports: number; people: number; lastAt: string }[];
  items: Report[];
}

export interface LocationShare {
  id: string;
  url?: string;
  active: boolean;
  lat: number;
  lng: number;
  positionAt: string;
  expiresAt: string;
  stoppedAt: string | null;
  route: {
    line: { id: number; code: string; name: string; color: string };
    dest: { id: number; name: string } | null;
    eta: string | null;
    etaInMin: number | null;
  } | null;
}
