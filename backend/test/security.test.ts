import { readFileSync } from 'node:fs';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import selfsigned from 'selfsigned';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { hashPassword, verifyPassword } from '../src/lib/password.js';
import { useTestApp } from './helpers.js';

const ctx = useTestApp();
const forced = useTestApp({ env: { FORCE_HTTPS: 'true', HTTPS_PORT: '3443', TRUST_PROXY: '1' } });
const behindDocker = useTestApp({ env: { FORCE_HTTPS: 'true', HTTPS_PORT: '3443', HTTPS_PUBLIC_PORT: '443' } });

describe('US13 — HTTPS no Node', () => {
  let server: https.Server;
  let port: number;
  let cert: string;

  beforeAll(async () => {
    const pems = await selfsigned.generate([{ name: 'commonName', value: 'localhost' }], { keySize: 2048, algorithm: 'sha256' });
    cert = pems.cert;
    server = https.createServer({ cert: pems.cert, key: pems.private }, ctx.app);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('a API responde por TLS e sabe que a conexão é segura', async () => {
    const body = await new Promise<string>((resolve, reject) => {
      https
        .get(
          { host: '127.0.0.1', port, path: '/api/v1/health', ca: cert, servername: 'localhost', checkServerIdentity: () => undefined },
          (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => resolve(data));
          },
        )
        .on('error', reject);
    });
    expect(JSON.parse(body).data).toMatchObject({ status: 'ok', app: 'mobilidade-urbana-sprint-01', https: true });
  });

  it('envia HSTS e cabeçalhos de segurança', async () => {
    const res = await request(ctx.app).get('/api/v1/health').expect(200);
    expect(res.headers['strict-transport-security']).toContain('max-age=31536000');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('com FORCE_HTTPS, HTTP é redirecionado para HTTPS', async () => {
    const res = await request(forced.app).get('/api/v1/lines?q=175').expect(308);
    expect(res.headers.location).toBe('https://127.0.0.1:3443/api/v1/lines?q=175');
  });

  it('o redirecionamento usa a porta pública quando definida (ex.: Docker 443 → 3443)', async () => {
    const res = await request(behindDocker.app).get('/api/v1/lines').expect(308);
    expect(res.headers.location).toBe('https://127.0.0.1/api/v1/lines');
  });

  it('a sonda de saúde responde por HTTP mesmo com FORCE_HTTPS (healthcheck do container)', async () => {
    const res = await request(forced.app).get('/api/v1/health').expect(200);
    expect(res.body.data.https).toBe(false);
  });

  it('com FORCE_HTTPS, requisição que chega via proxy HTTPS passa', async () => {
    await request(forced.app).get('/api/v1/lines').set('X-Forwarded-Proto', 'https').expect(200);
  });

  it('o certificado de desenvolvimento gerado por "npm run certs" é válido quando existe', () => {
    const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'certs', 'dev-cert.pem');
    let pem: string | null = null;
    try {
      pem = readFileSync(file, 'utf8');
    } catch {
      /* ainda não gerado: nada a conferir */
    }
    if (pem) expect(pem).toContain('BEGIN CERTIFICATE');
  });
});

describe('US13 — senhas hasheadas', () => {
  it('bcrypt com custo 12 e verificação correta', async () => {
    const h = await hashPassword('Senha@123');
    expect(h).toMatch(/^\$2[aby]\$12\$.{53}$/);
    expect(await verifyPassword('Senha@123', h)).toBe(true);
    expect(await verifyPassword('senha@123', h)).toBe(false);
  });

  it('hashes diferentes para a mesma senha (sal aleatório)', async () => {
    expect(await hashPassword('Senha@123')).not.toBe(await hashPassword('Senha@123'));
  });
});

describe('configuração', () => {
  it('produção exige JWT_SECRET e liga FORCE_HTTPS por padrão', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
    const c = loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40) });
    expect(c.FORCE_HTTPS).toBe(true);
  });

  it('JWT_SECRET curto é recusado', () => {
    expect(() => loadConfig({ JWT_SECRET: 'curto' })).toThrow(/32/);
  });

  it('desenvolvimento funciona sem .env', () => {
    const c = loadConfig({});
    expect(c).toMatchObject({ NODE_ENV: 'development', PORT: 3333, HTTPS_PORT: 3443, FORCE_HTTPS: false });
  });
});

describe('erros da API', () => {
  it('rota desconhecida → 404 em JSON', async () => {
    const res = await request(ctx.app).get('/api/v1/nao-existe').expect(404);
    expect(res.body.error.code).toBe('not_found');
  });

  it('JSON inválido → 400', async () => {
    const res = await request(ctx.app).post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{oops').expect(400);
    expect(res.body.error.code).toBe('invalid_json');
  });

  it('corpo grande demais → 413', async () => {
    await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email: 'a@b.com', password: 'x'.repeat(200_000) })
      .expect(413);
  });
});
