import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { auth, lineId, registerAndLogin, useTestApp } from './helpers.js';

/** Brechas encontradas tentando "quebrar" o app como um usuário mal-intencionado. */
const ctx = useTestApp({ withNetwork: true });
const api = () => request(ctx.app);

describe('senhas e bcrypt', () => {
  it('senha acima de 72 bytes é recusada (o bcrypt ignoraria o resto)', async () => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ name: 'Longa', email: 'longa@email.com', password: `${'A'.repeat(72)}1` })
      .expect(422);
    expect(res.body.error.details[0].message).toMatch(/72/);
  });

  it('72 bytes com acentos (2 bytes cada) também conta como limite', async () => {
    await api()
      .post('/api/v1/auth/register')
      .send({ name: 'Acento', email: 'acento@email.com', password: `${'é'.repeat(36)}1` })
      .expect(422);
  });
});

describe('nomes', () => {
  it('nome só com caracteres invisíveis é recusado', async () => {
    const res = await api().post('/api/v1/auth/register').send({ name: '​​ ', email: 'zw@email.com', password: 'Senha123' }).expect(422);
    expect(res.body.error.details[0].field).toBe('name');
  });

  it('remove invisíveis e junta espaços', async () => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ name: ' Ana​   Maria‮ ', email: 'am@email.com', password: 'Senha123' })
      .expect(201);
    expect(res.body.data.user.name).toBe('Ana Maria');
    const { token } = res.body.data;
    await api().patch('/api/v1/me').set(auth(token)).send({ name: '12345' }).expect(422);
    await api()
      .patch('/api/v1/me')
      .set(auth(token))
      .send({ name: 'x'.repeat(101) })
      .expect(422);
  });
});

describe('ids absurdos não viram erro 500', () => {
  it.each(['99999999999', '2147483648', '1e3', '-1', '0', '1.5'])('id %s', async (id) => {
    const { token } = await registerAndLogin(ctx);
    const del = await api().delete(`/api/v1/me/favorites/${id}`).set(auth(token));
    expect(del.status).toBeLessThan(500);
    const put = await api().put(`/api/v1/me/favorites/${id}`).set(auth(token));
    expect(put.status).toBeLessThan(500);
    expect((await api().get(`/api/v1/lines/${id}`)).status).toBeLessThan(500);
    expect((await api().get(`/api/v1/stops/${id}`)).status).toBeLessThan(500);
  });

  it('viagem com ids enormes', async () => {
    const { token } = await registerAndLogin(ctx);
    await api()
      .post('/api/v1/me/trips')
      .set(auth(token))
      .send({ lineId: 2 ** 40, originStopId: 1, destStopId: 2 })
      .expect(422);
  });
});

describe('linhas desativadas', () => {
  it('não podem ser favoritadas nem receber viagens', async () => {
    const { token } = await registerAndLogin(ctx);
    const id = await lineId(ctx, '014');
    const fav = await api().put(`/api/v1/me/favorites/${id}`).set(auth(token)).expect(409);
    expect(fav.body.error.code).toBe('line_inactive');
    const detail = await api().get(`/api/v1/lines/${id}`).expect(200);
    await api()
      .post('/api/v1/me/trips')
      .set(auth(token))
      .send({ lineId: id, originStopId: detail.body.data.stops[0].id, destStopId: detail.body.data.stops[2].id })
      .expect(409);
  });
});

describe('links de redefinição de senha', () => {
  const linkToken = (i: number) => ctx.mails[i]!.text.match(/token=([a-f0-9]{64})/)![1]!;

  it('ao redefinir, os outros links pedidos antes deixam de valer', async () => {
    await registerAndLogin(ctx);
    await api().post('/api/v1/auth/forgot-password').send({ email: 'marina@email.com' }).expect(202);
    await api().post('/api/v1/auth/forgot-password').send({ email: 'marina@email.com' }).expect(202);
    await api()
      .post('/api/v1/auth/reset-password')
      .send({ token: linkToken(1), password: 'NovaSenha1' })
      .expect(204);
    await api()
      .post('/api/v1/auth/reset-password')
      .send({ token: linkToken(0), password: 'Invasor99' })
      .expect(400);
  });

  it('trocar a senha pelo perfil invalida links antigos (um link vazado não desfaz a troca)', async () => {
    const { token } = await registerAndLogin(ctx);
    await api().post('/api/v1/auth/forgot-password').send({ email: 'marina@email.com' }).expect(202);
    await api().post('/api/v1/me/password').set(auth(token)).send({ currentPassword: 'Senha@123', newPassword: 'Trocada99' }).expect(200);
    await api()
      .post('/api/v1/auth/reset-password')
      .send({ token: linkToken(0), password: 'Invasor99' })
      .expect(400);
    await api().post('/api/v1/auth/login').send({ email: 'marina@email.com', password: 'Trocada99' }).expect(200);
  });
});

describe('validação em português e entradas estranhas', () => {
  it('corpo que não é objeto', async () => {
    const res = await api().post('/api/v1/auth/login').send([1, 2]).expect(422);
    expect(res.body.error.details[0].message).toMatch(/esperava um objeto/);
  });

  it('mensagens padrão em português', async () => {
    const res = await api()
      .get(`/api/v1/lines?q=${'a'.repeat(61)}`)
      .expect(422);
    expect(res.body.error.details[0].message).toMatch(/Grande demais/);
  });

  it('cadastro simultâneo com o mesmo e-mail: um entra, o outro recebe email_taken', async () => {
    const body = { name: 'Dupla', email: 'dupla@email.com', password: 'Senha123' };
    const results = await Promise.all([api().post('/api/v1/auth/register').send(body), api().post('/api/v1/auth/register').send(body)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409)!.body.error.code).toBe('email_taken');
  });

  it('busca com caracteres especiais não quebra', async () => {
    for (const q of ['%', '(', '\\', "' OR 1=1 --", '<script>', '😀']) {
      const res = await api().get(`/api/v1/lines?q=${encodeURIComponent(q)}`);
      expect(res.status).toBe(200);
      const st = await api().get(`/api/v1/stops?q=${encodeURIComponent(q)}`);
      expect(st.status).toBe(200);
    }
  });
});

describe('cabeçalhos forjados (sem proxy na frente)', () => {
  it('X-Forwarded-Proto não engana o redirecionamento HTTPS por padrão', async () => {
    const forced = useTestAppForced();
    const res = await request(forced).get('/api/v1/lines').set('X-Forwarded-Proto', 'https');
    expect(res.status).toBe(308);
  });

  it('X-Forwarded-For não troca o IP usado no limite de tentativas', async () => {
    const a = await request(directApp())
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '1.1.1.1')
      .send({ email: 'a@b.com', password: 'x' });
    const b = await request(directApp())
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '2.2.2.2')
      .send({ email: 'a@b.com', password: 'x' });
    const left = (r: request.Response) => Number(/r=(\d+)/.exec(String(r.headers.ratelimit))![1]);
    expect(left(b)).toBe(left(a) - 1);
  });
});

/** API "de produção" acessada direto, sem proxy (limite de tentativas ligado). */
function directApp() {
  return (directCache ??= createApp({
    ...ctx.deps,
    config: loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40), FORCE_HTTPS: 'false' }),
  }));
}
let directCache: ReturnType<typeof createApp> | undefined;

function useTestAppForced() {
  return createApp({
    ...ctx.deps,
    config: loadConfig({ NODE_ENV: 'test', JWT_SECRET: 'x'.repeat(40), FORCE_HTTPS: 'true' }),
  });
}
