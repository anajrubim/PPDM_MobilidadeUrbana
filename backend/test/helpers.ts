import 'dotenv/config';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeEach } from 'vitest';
import { createApp, type Deps } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { seedNetwork } from '../src/db/demo-data.js';
import { createPool } from '../src/db/pool.js';
import type { Mail } from '../src/lib/mailer.js';
import { TEST_DB } from './global-setup.js';

export interface TestContext {
  deps: Deps;
  app: ReturnType<typeof createApp>;
  mails: Mail[];
  now: { value: Date };
}

/** 21/09/2026 09:00 em São Paulo (12:00 UTC) — horário fixo para previsões determinísticas. */
export const FIXED_NOW = new Date('2026-09-21T12:00:00Z');

/** Cria app + banco limpo a cada teste. `withNetwork` popula a rede de demonstração. */
export function useTestApp(opts: { withNetwork?: boolean; env?: Record<string, string> } = {}): TestContext {
  const db = createPool(TEST_DB);
  const ctx = { mails: [], now: { value: FIXED_NOW } } as unknown as TestContext;
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DB,
    JWT_SECRET: 'test-secret-test-secret-test-secret-123',
    PUBLIC_APP_URL: 'http://localhost:8081/reset-password',
    ...opts.env,
  });
  const deps: Deps = {
    db,
    config,
    logger: pino({ level: 'silent' }),
    mailer: { send: async (m) => void ctx.mails.push(m) },
    clock: () => ctx.now.value,
  };
  ctx.deps = deps;
  ctx.app = createApp(deps);

  beforeEach(async () => {
    ctx.mails.length = 0;
    ctx.now.value = FIXED_NOW;
    const { rows } = await db.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'",
    );
    await db.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
    if (opts.withNetwork) await seedNetwork(db);
  });
  afterAll(async () => {
    await db.end();
  });
  return ctx;
}

export async function registerAndLogin(
  ctx: TestContext,
  overrides: Partial<{ name: string; email: string; password: string }> = {},
): Promise<{ token: string; id: string }> {
  const body = { name: 'Marina Alves', email: 'marina@email.com', password: 'Senha@123', ...overrides };
  const res = await request(ctx.app).post('/api/v1/auth/register').send(body).expect(201);
  return { token: res.body.data.token, id: res.body.data.user.id };
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Id de uma linha da rede de demonstração pelo código. */
export async function lineId(ctx: TestContext, code: string): Promise<number> {
  const { rows } = await ctx.deps.db.query<{ id: number }>('SELECT id FROM lines WHERE code = $1', [code]);
  return rows[0]!.id;
}
