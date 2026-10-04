import 'dotenv/config';
import pg from 'pg';
import { runMigrations } from '../src/db/migrator.js';

export const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgres://dmr:dmr@localhost:5434/dmr_test';

/** Recria o esquema do banco de testes e aplica as migrações (uma vez por execução). */
export default async function setup() {
  const db = new pg.Pool({ connectionString: TEST_DB });
  try {
    await db.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  } catch (err) {
    await db.end();
    throw new Error(
      `Banco de testes indisponível em ${TEST_DB.replace(/:[^:@/]+@/, ':***@')}: ${(err as Error).message}. ` +
        'Suba o banco com "npm run db:up" (ele já cria o dmr_test).',
      { cause: err },
    );
  }
  await runMigrations(db);
  await db.end();
}
