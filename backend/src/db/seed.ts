/**
 * Popula o banco com a rede de demonstração e uma conta de exemplo.
 * Uso: npm run seed   (idempotente — rodar de novo não duplica nada)
 */
import { loadConfig } from '../config.js';
import { hashPassword } from '../lib/password.js';
import { tripSegment } from '../modules/me/routes.js';
import { loadNetwork } from '../modules/transit/network.js';
import { seedNetwork } from './demo-data.js';
import { runMigrations } from './migrator.js';
import { createPool } from './pool.js';

const config = loadConfig();
// A conta de demonstração tem senha conhecida: nunca rodar contra produção por acidente
if (config.NODE_ENV === 'production' && !process.argv.includes('--force')) {
  console.error('Recusado: seed com conta de demonstração em NODE_ENV=production (use --force se for intencional).');
  process.exit(1);
}
const db = createPool(config.DATABASE_URL);
try {
  await runMigrations(db);
} catch (err) {
  console.error(`Não consegui acessar o banco (${(err as Error).message}). Ele está rodando? Use "npm run db:up".`);
  process.exit(1);
}
await seedNetwork(db);

const email = 'marina@email.com';
const found = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [email]);
if (!found.rows[0]) {
  const { rows } = await db.query<{ id: string }>('INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id', [
    'Marina Alves',
    email,
    await hashPassword('Senha@123'),
  ]);
  const userId = rows[0]!.id;
  const net = await loadNetwork(db);
  const byCode = new Map(net.lines.map((l) => [l.code, l]));
  for (const code of ['175', '232', '875']) {
    await db.query('INSERT INTO favorites (user_id, line_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, byCode.get(code)!.id]);
  }
  // Viagens dos últimos dias para o resumo do dashboard: [linha, índice embarque, índice desembarque, dias atrás, hora]
  const trips: [string, number, number, number, string][] = [
    ['175', 0, 11, 0, '08:02'],
    ['175B', 0, 11, 1, '18:24'],
    ['232', 0, 17, 2, '17:40'],
    ['175', 0, 8, 3, '08:10'],
    ['08', 1, 8, 5, '12:15'],
  ];
  for (const [code, from, to, daysAgo, hhmm] of trips) {
    const line = byCode.get(code)!;
    const seg = tripSegment(net, line.id, line.stops[from]!.stopId, line.stops[to]!.stopId);
    await db.query(
      `INSERT INTO trips (user_id, line_id, line_code, origin_stop_id, dest_stop_id, origin_label, dest_label,
                          duration_min, distance_m, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
               ((now() AT TIME ZONE 'America/Sao_Paulo')::date - $10::int + $11::time) AT TIME ZONE 'America/Sao_Paulo')`,
      [userId, line.id, code, seg.origin.id, seg.dest.id, seg.origin.name, seg.dest.name, seg.durationMin, seg.distanceM, daysAgo, hhmm],
    );
  }
  console.log('Conta de demonstração criada com 3 favoritas e 5 viagens.');
}

const counts = await db.query<{ lines: number; stops: number }>(
  'SELECT (SELECT count(*)::int FROM lines) AS lines, (SELECT count(*)::int FROM stops) AS stops',
);
console.log(`Seed concluído: ${counts.rows[0]!.lines} linhas, ${counts.rows[0]!.stops} paradas.`);
console.log(`  Usuária de demonstração: ${email} / Senha@123`);
await db.end();
