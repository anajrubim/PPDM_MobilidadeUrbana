import type { Db } from './pool.js';
import { withTransaction } from './pool.js';
import { haversine, type LatLng } from '../lib/geo.js';

/**
 * Rede de demonstração (fictícia, inspirada em São José dos Campos/SP) usada no seed e nos testes (Sprint 1).
 * Nomes dos pontos e linhas seguem o UI kit do projeto.
 */
type Anchor = { name: string; pos: LatLng };

const H = {
  TC: { name: 'Terminal Central', pos: [-23.1865, -45.8845] },
  RF: { name: 'Rua das Flores, 120', pos: [-23.1905, -45.8895] },
  PM: { name: 'Praça da Matriz', pos: [-23.1935, -45.893] },
  AB: { name: 'Av. Brasil, 450', pos: [-23.1968, -45.8962] },
  CE: { name: 'Colégio Estadual', pos: [-23.2005, -45.9003] },
  VE: { name: 'Vila Ema (final)', pos: [-23.2046, -45.9046] },
  SC: { name: 'Shopping Colinas', pos: [-23.2108, -45.9092] },
  HM: { name: 'Hospital Municipal', pos: [-23.205, -45.89] },
  JS: { name: 'Jd. Satélite', pos: [-23.2285, -45.879] },
  SA: { name: 'Santana', pos: [-23.165, -45.8905] },
  AP: { name: 'Alto da Ponte', pos: [-23.148, -45.895] },
  VI: { name: 'Vila Industrial', pos: [-23.1905, -45.866] },
  ZL: { name: 'Zona Leste', pos: [-23.193, -45.842] },
  AE: { name: 'Aeroporto', pos: [-23.2285, -45.868] },
} satisfies Record<string, Anchor>;

const STREETS = [
  'Rua Sete de Setembro',
  'Av. São João',
  'Rua XV de Novembro',
  'Rua Humaitá',
  'Av. Nove de Julho',
  'Rua Paraibuna',
  'Rua Rubião Júnior',
  'Av. Andrômeda',
  'Rua Euclides Miragaia',
  'Av. Cassiano Ricardo',
  'Rua Vilaça',
  'Av. Tivoli',
  'Rua Teopompo de Vasconcelos',
  'Av. Madre Tereza',
  'Rua Siqueira Campos',
  'Av. Heitor Villa Lobos',
  'Rua Francisco Paes',
  'Av. Jorge Zarur',
  'Rua Carlos Gomes',
  'Av. Ouro Fino',
  'Rua Coronel José Monteiro',
  'Av. Olivo Gomes',
  'Rua Major Antônio Domingues',
  'Av. Juscelino Kubitschek',
  'Rua Bento Pereira',
  'Av. Pedro Álvares Cabral',
  'Rua Santa Clara',
  'Av. Engenheiro Sebastião Gualberto',
];

interface LineSpec {
  code: string;
  name: string;
  origin: string;
  destination: string;
  serviceType: 'normal' | 'executivo' | 'noturno' | 'expresso';
  status?: 'active' | 'inactive' | 'maintenance';
  color: string;
  headwayMin: number;
  first: string;
  last: string;
  anchors: (keyof typeof H)[];
  stops: number;
  reverseOf?: string;
}

const LINES: LineSpec[] = [
  {
    code: '175',
    name: 'Terminal → Vila Ema',
    origin: 'Terminal',
    destination: 'Vila Ema',
    serviceType: 'normal',
    color: '#1B4F72',
    headwayMin: 18,
    first: '05:00',
    last: '23:30',
    anchors: ['TC', 'RF', 'PM', 'AB', 'CE', 'VE'],
    stops: 12,
  },
  {
    code: '175B',
    name: 'Vila Ema → Terminal (volta)',
    origin: 'Vila Ema',
    destination: 'Terminal',
    serviceType: 'normal',
    color: '#2E6E96',
    headwayMin: 18,
    first: '05:10',
    last: '23:40',
    anchors: ['VE', 'CE', 'AB', 'PM', 'RF', 'TC'],
    stops: 12,
  },
  {
    code: '175E',
    name: 'Terminal → Vila Ema (expresso)',
    origin: 'Terminal',
    destination: 'Vila Ema',
    serviceType: 'expresso',
    color: '#7C5CBF',
    headwayMin: 20,
    first: '06:00',
    last: '09:00',
    anchors: ['TC', 'RF', 'AB', 'CE', 'VE'],
    stops: 6,
  },
  {
    code: '232',
    name: 'Centro → Jd. Satélite',
    origin: 'Centro',
    destination: 'Jd. Satélite',
    serviceType: 'normal',
    color: '#219653',
    headwayMin: 15,
    first: '04:40',
    last: '23:50',
    anchors: ['PM', 'AB', 'HM', 'JS'],
    stops: 18,
  },
  {
    code: '08',
    name: 'Terminal → Shopping Colinas',
    origin: 'Terminal',
    destination: 'Shopping Colinas',
    serviceType: 'normal',
    color: '#F2994A',
    headwayMin: 20,
    first: '06:00',
    last: '22:00',
    anchors: ['TC', 'RF', 'AB', 'VE', 'SC'],
    stops: 9,
  },
  {
    code: '875',
    name: 'Circular Norte',
    origin: 'Terminal',
    destination: 'Terminal',
    serviceType: 'normal',
    color: '#C9971C',
    headwayMin: 20,
    first: '05:30',
    last: '23:00',
    anchors: ['TC', 'SA', 'AP', 'SA', 'PM', 'TC'],
    stops: 21,
  },
  {
    code: '014',
    name: 'Zona Leste → Centro',
    origin: 'Zona Leste',
    destination: 'Centro',
    serviceType: 'normal',
    status: 'inactive',
    color: '#566573',
    headwayMin: 25,
    first: '05:00',
    last: '22:00',
    anchors: ['ZL', 'VI', 'TC', 'PM'],
    stops: 15,
  },
  {
    code: '301',
    name: 'Vila Industrial → Hospital',
    origin: 'Vila Industrial',
    destination: 'Hospital Municipal',
    serviceType: 'normal',
    color: '#E74C3C',
    headwayMin: 20,
    first: '05:15',
    last: '22:30',
    anchors: ['VI', 'TC', 'PM', 'HM'],
    stops: 10,
  },
  {
    code: 'N10',
    name: 'Noturno Centro → Vila Ema',
    origin: 'Centro',
    destination: 'Vila Ema',
    serviceType: 'noturno',
    color: '#0F3450',
    headwayMin: 40,
    first: '23:40',
    last: '04:20',
    anchors: ['TC', 'PM', 'CE', 'VE'],
    stops: 7,
  },
  {
    code: 'E50',
    name: 'Executivo Terminal → Aeroporto',
    origin: 'Terminal',
    destination: 'Aeroporto',
    serviceType: 'executivo',
    color: '#186B3C',
    headwayMin: 45,
    first: '05:30',
    last: '21:30',
    anchors: ['TC', 'HM', 'AE'],
    stops: 4,
  },
];

const round = (v: number) => Math.round(v * 1e6) / 1e6;

/** Distribui `count` pontos ao longo das âncoras (âncoras sempre incluídas). */
function stopsAlong(anchors: Anchor[], count: number): Anchor[] {
  const segs = anchors.length - 1;
  const extra = Math.max(0, count - anchors.length);
  const lens = anchors.slice(1).map((a, i) => haversine(anchors[i]!.pos, a.pos));
  const total = lens.reduce((a, b) => a + b, 0) || 1;
  const perSeg = lens.map((l) => Math.floor((l / total) * extra));
  let left = extra - perSeg.reduce((a, b) => a + b, 0);
  for (let i = 0; left > 0; i = (i + 1) % segs, left--) perSeg[i]!++;
  const out: Anchor[] = [anchors[0]!];
  for (let s = 0; s < segs; s++) {
    const a = anchors[s]!;
    const b = anchors[s + 1]!;
    const n = perSeg[s]!;
    for (let k = 1; k <= n; k++) {
      const t = k / (n + 1);
      out.push({ name: '', pos: [round(a.pos[0] + (b.pos[0] - a.pos[0]) * t), round(a.pos[1] + (b.pos[1] - a.pos[1]) * t)] });
    }
    out.push(b);
  }
  return out;
}

export async function seedNetwork(db: Db): Promise<void> {
  // Cada bloco é idempotente: rodar de novo não duplica nem impede o bloco seguinte.
  await withTransaction(db, async (c) => {
    const existing = await c.query('SELECT count(*)::int AS n FROM lines');
    if (existing.rows[0].n > 0) return;
    const stopIds = new Map<string, number>();
    let streetIdx = 0;
    let codeSeq = 1;
    const ensureStop = async (a: Anchor): Promise<number> => {
      const key = a.name || `${a.pos[0]},${a.pos[1]}`;
      const found = stopIds.get(key);
      if (found) return found;
      const name = a.name || `${STREETS[streetIdx % STREETS.length]}, ${100 + ((streetIdx * 137) % 1800)}`;
      streetIdx++;
      const code = `P${String(codeSeq++).padStart(3, '0')}`;
      const { rows } = await c.query('INSERT INTO stops (code, name, lat, lng) VALUES ($1, $2, $3, $4) RETURNING id', [
        code,
        name,
        a.pos[0],
        a.pos[1],
      ]);
      stopIds.set(key, rows[0].id);
      return rows[0].id;
    };

    for (const spec of LINES) {
      const anchors = spec.anchors.map((k) => H[k] as Anchor);
      const pts = stopsAlong(anchors, spec.stops);
      const { rows } = await c.query(
        `INSERT INTO lines (code, name, origin, destination, service_type, status, color, headway_min,
                            first_departure, last_departure, shape)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [
          spec.code,
          spec.name,
          spec.origin,
          spec.destination,
          spec.serviceType,
          spec.status ?? 'active',
          spec.color,
          spec.headwayMin,
          spec.first,
          spec.last,
          JSON.stringify(pts.map((p) => p.pos)),
        ],
      );
      const lineId = rows[0].id;
      // 18 km/h médios (300 m/min) + 30 s por parada
      let offset = 0;
      for (let i = 0; i < pts.length; i++) {
        if (i > 0) offset += haversine(pts[i - 1]!.pos, pts[i]!.pos) / 300 + 0.5;
        const stopId = await ensureStop(pts[i]!);
        await c.query('INSERT INTO line_stops (line_id, stop_id, seq, offset_min) VALUES ($1, $2, $3, $4)', [
          lineId,
          stopId,
          i + 1,
          Math.round(offset),
        ]);
      }
    }
  });
}

export const DEMO_LINES = LINES.map((l) => l.code);
export const DEMO_HUBS = H;
