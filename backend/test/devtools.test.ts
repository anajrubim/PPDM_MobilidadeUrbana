import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { expoPush } from '../src/modules/notifications/push.js';
import pino from 'pino';
import { auth, lineId, registerAndLogin, useTestApp } from './helpers.js';

const ctx = useTestApp({ withNetwork: true });
const api = () => request(ctx.app);

describe('ferramentas de desenvolvimento (US17)', () => {
  it('cria aviso de atraso e notifica quem tem a linha favorita', async () => {
    const { token } = await registerAndLogin(ctx);
    await api().put(`/api/v1/me/favorites/${await lineId(ctx, '232')}`).set(auth(token)).expect(200);
    const res = await api().post('/api/v1/dev/alerts').send({ lineCode: '232', kind: 'delay', extraDelayMin: 12 }).expect(201);
    expect(res.body.data.alert).toMatchObject({ kind: 'delay', extraDelayMin: 12, title: 'Trânsito intenso' });
    expect(res.body.data.notificationsCreated.serviceAlerts).toBe(1);
    const line = (await api().get(`/api/v1/lines/${await lineId(ctx, '232')}`).expect(200)).body.data;
    expect(line.alerts[0]).toMatchObject({ active: true, extraDelayMin: 12 });
    await api().post('/api/v1/dev/alerts').send({ lineCode: 'XYZ' }).expect(404);
    await api().post('/api/v1/dev/monitor/tick').expect(200);
  });

  it('página de simulação (formulário sem script)', async () => {
    const page = await api().get('/dev/simular').expect(200);
    expect(page.text).toContain('<form method="post" action="/dev/simular">');
    expect(page.text).toContain('175 · Terminal → Vila Ema');
    const sent = await api().post('/dev/simular').type('form').send({ lineCode: '08', kind: 'detour', startsInMin: '0', durationMin: '30' }).expect(200);
    expect(sent.text).toContain('Aviso criado na linha 08');
  });

  it('não existe em produção', async () => {
    const { createApp } = await import('../src/app.js');
    const prod = createApp({ ...ctx.deps, config: { ...ctx.deps.config, NODE_ENV: 'production', FORCE_HTTPS: false } });
    await request(prod).get('/dev/simular').expect(404);
    await request(prod).post('/api/v1/dev/alerts').send({ lineCode: '175' }).expect(404);
  });
});

describe('push pelo Expo (US17)', () => {
  it('envia só tokens do Expo, em lotes, e não derruba a API se o serviço falhar', async () => {
    const calls: { url: string; body: unknown[] }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response('{}', { status: calls.length === 1 ? 200 : 500 });
    }) as unknown as typeof fetch;
    const push = expoPush(pino({ level: 'silent' }), 'tok', fake);
    const tokens = [...Array.from({ length: 150 }, (_, i) => `ExponentPushToken[t${i}]`), 'lixo'];
    await push.send(tokens, { title: 'Oi', body: 'Teste' });
    expect(calls).toHaveLength(2);
    expect(calls[0]!.url).toBe('https://exp.host/--/api/v2/push/send');
    expect(calls[0]!.body).toHaveLength(100);
    expect(calls[1]!.body).toHaveLength(50);
    expect(calls[0]!.body[0]).toMatchObject({ to: 'ExponentPushToken[t0]', title: 'Oi', body: 'Teste' });
    const failing = expoPush(pino({ level: 'silent' }), undefined, (async () => {
      throw new Error('rede');
    }) as unknown as typeof fetch);
    await expect(failing.send(['ExponentPushToken[x]'], { title: 'a', body: 'b' })).resolves.toBeUndefined();
  });
});

describe('ferramentas de dev: só no próprio computador e sem CSRF', () => {
  it('recusa proxy, Host de fora e pedidos vindos de outro site', async () => {
    await api().get('/dev/simular').set('X-Forwarded-For', '203.0.113.9').expect(403);
    await api().get('/api/v1/dev/monitor/tick').set('Forwarded', 'for=203.0.113.9').expect(403);
    await api().get('/dev/simular').set('Host', 'mobilidade.app').expect(403);
    await api().post('/api/v1/dev/alerts').set('Origin', 'https://site-malicioso.com').send({ lineCode: '175' }).expect(403);
    await api().post('/dev/simular').set('Sec-Fetch-Site', 'cross-site').type('form').send({ lineCode: '175' }).expect(403);
    await api().post('/api/v1/dev/alerts').set('Origin', 'http://localhost:8081').send({ lineCode: '175' }).expect(201);
  });
});
