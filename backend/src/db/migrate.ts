import { loadConfig } from '../config.js';
import { runMigrations } from './migrator.js';
import { createPool } from './pool.js';

const config = loadConfig();
const db = createPool(config.DATABASE_URL);
const ran = await runMigrations(db);
console.log(ran.length ? `Migrações aplicadas: ${ran.join(', ')}` : 'Banco já está atualizado.');
await db.end();
