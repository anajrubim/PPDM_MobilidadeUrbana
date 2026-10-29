import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { auth, FIXED_NOW, lineId, registerAndLogin, useTestApp } from './helpers.js';

const ctx = useTestApp({ withNetwork: true });
const api = () => request(ctx.app);
const minutes = (n: number) => new Date(FIXED_NOW.getTime() + n * 60_000);
const tokenOf = (url: string) => url.split('/').at(-1)!;

describe('US29 — compartilhar localização/rota com um contato', () => {
  it('cria um link temporário que mostra a posição, a linha e a chegada prevista', async () => {
    const { token } = await registerAndLogin(ctx);
    const id = await lineId(ctx, '175');
    const stops = (await api().get(`/api/v1/lines/${id}`).expect(200)).body.data.stops;
    const res = await api()
      .post('/api/v1/me/shares')
      .set(auth(token))
      .send({ lat: stops[2].lat, lng: stops[2].lng, lineId: id, destStopId: stops.at(-1).id, durationMin: 30 })
      .expect(201);
    const s = res.body.data;
    expect(s.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/s\/[A-Za-z0-9_-]{32}$/);
    expect(s).toMatchObject({ active: true, expiresAt: minutes(30).toISOString() });
    expect(s.route).toMatchObject({ line: { code: '175' }, dest: { name: 'Vila Ema (final)' }, eta: expect.stringMatching(/^\d\d:\d\d$/) });
    expect(s.route.etaInMin).toBe(stops.at(-1).offsetMin - stops[2].offsetMin);
    // O token não fica no banco
    const { rows } = await ctx.deps.db.query<{ token_hash: string }>('SELECT token_hash FROM location_shares');
    expect(rows[0]!.token_hash).not.toBe(tokenOf(s.url));

    const t = tokenOf(s.url);
    const pub = await api().get(`/api/v1/shares/${t}`).expect(200);
    expect(pub.headers['cache-control']).toBe('no-store');
    expect(pub.body.data).toMatchObject({ name: 'Marina A.', active: true, position: { lat: stops[2].lat, lng: stops[2].lng } });
    expect(JSON.stringify(pub.body.data)).not.toContain('@');

    const page = await api().get(`/s/${t}`).expect(200);
    expect(page.headers['content-type']).toMatch(/text\/html/);
    expect(page.headers['content-security-policy']).toContain("default-src 'none'");
    expect(page.headers['x-robots-tag']).toContain('noindex');
    expect(page.text).toContain('Marina A. está compartilhando a localização');
    expect(page.text).toContain('openstreetmap.org/export/embed.html');
    expect(page.text).toContain('Vila Ema (final)');
    expect(page.text).not.toContain('<script');
  });

  it('atualiza a posição, encerra e expira', async () => {
    const { token } = await registerAndLogin(ctx);
    const s = (await api().post('/api/v1/me/shares').set(auth(token)).send({ lat: -23.19, lng: -45.89, durationMin: 15 }).expect(201)).body.data;
    expect(s.route).toBeNull();
    ctx.now.value = minutes(2);
    const moved = await api().put(`/api/v1/me/shares/${s.id}/position`).set(auth(token)).send({ lat: -23.2, lng: -45.9 }).expect(200);
    expect(moved.body.data).toMatchObject({ lat: -23.2, lng: -45.9, positionAt: minutes(2).toISOString() });
    expect((await api().get('/api/v1/me/shares').set(auth(token)).expect(200)).body.data).toHaveLength(1);

    const t = tokenOf(s.url);
    await api().delete(`/api/v1/me/shares/${s.id}`).set(auth(token)).expect(204);
    const pub = await api().get(`/api/v1/shares/${t}`).expect(200);
    // Encerrado: não mostra mais onde a pessoa está
    expect(pub.body.data).toMatchObject({ active: false, position: null, route: null });
    const page = await api().get(`/s/${t}`).expect(200);
    expect(page.text).toContain('parou de compartilhar');
    expect(page.text).not.toContain('-23.2');
    await api().put(`/api/v1/me/shares/${s.id}/position`).set(auth(token)).send({ lat: -23.2, lng: -45.9 }).expect(410);
    expect((await api().get('/api/v1/me/shares').set(auth(token)).expect(200)).body.data).toEqual([]);

    // Expira sozinho
    const s2 = (await api().post('/api/v1/me/shares').set(auth(token)).send({ lat: -23.19, lng: -45.89, durationMin: 5 }).expect(201)).body.data;
    ctx.now.value = minutes(10);
    expect((await api().get(`/api/v1/shares/${tokenOf(s2.url)}`).expect(200)).body.data.active).toBe(false);
  });

  it('link inválido ou inexistente, posição de outra pessoa e limites', async () => {
    const a = await registerAndLogin(ctx);
    const b = await registerAndLogin(ctx, { email: 'b@email.com' });
    await api().get('/api/v1/shares/curto').expect(422);
    await api().get(`/api/v1/shares/${'A'.repeat(32)}`).expect(404);
    const notFound = await api().get(`/s/${'A'.repeat(32)}`).expect(404);
    expect(notFound.text).toContain('Link inválido');
    await api().get('/s/<script>').expect(404);

    const s = (await api().post('/api/v1/me/shares').set(auth(a.token)).send({ lat: -23.19, lng: -45.89 }).expect(201)).body.data;
    await api().put(`/api/v1/me/shares/${s.id}/position`).set(auth(b.token)).send({ lat: 0, lng: 0 }).expect(404);
    await api().delete(`/api/v1/me/shares/${s.id}`).set(auth(b.token)).expect(404);
    await api().post('/api/v1/me/shares').set(auth(a.token)).send({ lat: 91, lng: 0 }).expect(422);
    await api().post('/api/v1/me/shares').set(auth(a.token)).send({ lat: 0, lng: 0, durationMin: 1000 }).expect(422);
    await api().post('/api/v1/me/shares').set(auth(a.token)).send({ lat: 0, lng: 0, destStopId: 1 }).expect(400);
    const id = await lineId(ctx, '175');
    const e50 = (await api().get(`/api/v1/lines/${await lineId(ctx, 'E50')}`).expect(200)).body.data.stops.at(-1);
    await api().post('/api/v1/me/shares').set(auth(a.token)).send({ lat: 0, lng: 0, lineId: id, destStopId: e50.id }).expect(400);
    for (let i = 0; i < 4; i++) await api().post('/api/v1/me/shares').set(auth(a.token)).send({ lat: 0, lng: 0 }).expect(201);
    const limit = await api().post('/api/v1/me/shares').set(auth(a.token)).send({ lat: 0, lng: 0 }).expect(409);
    expect(limit.body.error.code).toBe('too_many_shares');
    await api().post('/api/v1/me/shares').send({ lat: 0, lng: 0 }).expect(401);
  });

  it('PUBLIC_SHARE_URL define o endereço do link', async () => {
    ctx.deps.config.PUBLIC_SHARE_URL = 'https://mobilidade.app/s/';
    try {
      const { token } = await registerAndLogin(ctx);
      const s = (await api().post('/api/v1/me/shares').set(auth(token)).send({ lat: -23.19, lng: -45.89 }).expect(201)).body.data;
      expect(s.url).toMatch(/^https:\/\/mobilidade\.app\/s\/[A-Za-z0-9_-]{32}$/);
    } finally {
      ctx.deps.config.PUBLIC_SHARE_URL = '';
    }
  });
});

describe('US29 — proteção dos dados de localização', () => {
  it('pedidos em paralelo não furam o limite de compartilhamentos ativos', async () => {
    const { token } = await registerAndLogin(ctx);
    const res = await Promise.all(Array.from({ length: 12 }, () => api().post('/api/v1/me/shares').set(auth(token)).send({ lat: -23.19, lng: -45.89 })));
    expect(res.filter((r) => r.status === 201)).toHaveLength(5);
    expect(res.filter((r) => r.status === 409)).toHaveLength(7);
  });

  it('encerrar apaga a posição; o monitor apaga a dos expirados e remove os antigos', async () => {
    const { token } = await registerAndLogin(ctx);
    const a = (await api().post('/api/v1/me/shares').set(auth(token)).send({ lat: -23.19, lng: -45.89, durationMin: 5 }).expect(201)).body.data;
    const b = (await api().post('/api/v1/me/shares').set(auth(token)).send({ lat: -23.19, lng: -45.89, durationMin: 60 }).expect(201)).body.data;
    await api().delete(`/api/v1/me/shares/${b.id}`).set(auth(token)).expect(204);
    const pos = async (id: string) => (await ctx.deps.db.query('SELECT lat, lng FROM location_shares WHERE id = $1', [id])).rows[0];
    expect(await pos(b.id)).toEqual({ lat: null, lng: null });
    ctx.now.value = minutes(10);
    await ctx.app.services.monitor.tick();
    expect(await pos(a.id)).toEqual({ lat: null, lng: null });
    ctx.now.value = minutes(25 * 60);
    await ctx.app.services.monitor.tick();
    expect((await ctx.deps.db.query('SELECT 1 FROM location_shares')).rowCount).toBe(0);
  });

  it('em produção o PUBLIC_SHARE_URL é obrigatório', async () => {
    const { loadConfig } = await import('../src/config.js');
    expect(() => loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40) })).toThrow(/PUBLIC_SHARE_URL/);
    expect(loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40), PUBLIC_SHARE_URL: 'https://a.b/s' }).PUBLIC_SHARE_URL).toBe('https://a.b/s');
  });

  it('o token do link nunca vai para o log', async () => {
    const { redactUrl } = await import('../src/app.js');
    expect(redactUrl(`/s/${'a'.repeat(32)}`)).toBe('/s/[redigido]');
    expect(redactUrl(`/api/v1/shares/${'B_-'.repeat(10)}xy?x=1`)).toBe('/api/v1/shares/[redigido]?x=1');
    expect(redactUrl('/reset-password?token=abc123&x=1')).toBe('/reset-password?token=[redigido]&x=1');
    // Id (UUID) de compartilhamento não é segredo e não pode ser cortado
    const id = '0b5c1d7e-8f2a-4c3b-9d1e-2f3a4b5c6d7e';
    expect(redactUrl(`/api/v1/me/shares/${id}`)).toBe(`/api/v1/me/shares/${id}`);
  });
});
