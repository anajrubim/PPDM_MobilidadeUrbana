import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { auth, registerAndLogin, useTestApp } from './helpers.js';

const ctx = useTestApp();
const api = () => request(ctx.app);

describe('US04 — editar nome e senha', () => {
  it('altera o nome', async () => {
    const { token } = await registerAndLogin(ctx);
    const res = await api().patch('/api/v1/me').set(auth(token)).send({ name: '  Marina A. Souza ' }).expect(200);
    expect(res.body.data.name).toBe('Marina A. Souza');
    const me = await api().get('/api/v1/me').set(auth(token)).expect(200);
    expect(me.body.data.name).toBe('Marina A. Souza');
  });

  it('não aceita nome vazio', async () => {
    const { token } = await registerAndLogin(ctx);
    await api().patch('/api/v1/me').set(auth(token)).send({ name: '   ' }).expect(422);
  });

  it('troca a senha conferindo a atual e encerra as outras sessões', async () => {
    const { token } = await registerAndLogin(ctx);
    const other = (await api().post('/api/v1/auth/login').send({ email: 'marina@email.com', password: 'Senha@123' })).body.data.token;

    const res = await api()
      .post('/api/v1/me/password')
      .set(auth(token))
      .send({ currentPassword: 'Senha@123', newPassword: 'Trocada99' })
      .expect(200);
    const fresh = res.body.data.token as string;

    await api().get('/api/v1/me').set(auth(fresh)).expect(200);
    await api().get('/api/v1/me').set(auth(other)).expect(401);
    await api().post('/api/v1/auth/login').send({ email: 'marina@email.com', password: 'Trocada99' }).expect(200);
  });

  it('recusa quando a senha atual está errada ou a nova é fraca', async () => {
    const { token } = await registerAndLogin(ctx);
    const wrong = await api()
      .post('/api/v1/me/password')
      .set(auth(token))
      .send({ currentPassword: 'errada', newPassword: 'Trocada99' })
      .expect(400);
    expect(wrong.body.error.code).toBe('wrong_password');
    // a sessão continua válida depois de errar a senha atual
    await api().get('/api/v1/me').set(auth(token)).expect(200);
    await api().post('/api/v1/me/password').set(auth(token)).send({ currentPassword: 'Senha@123', newPassword: 'fraca' }).expect(422);
  });

  it('conta apagada invalida o token', async () => {
    const { token, id } = await registerAndLogin(ctx);
    await ctx.deps.db.query('DELETE FROM users WHERE id = $1', [id]);
    await api().get('/api/v1/me').set(auth(token)).expect(401);
  });
});
