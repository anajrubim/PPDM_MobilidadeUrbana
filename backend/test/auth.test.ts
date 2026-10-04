import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { auth, registerAndLogin, useTestApp } from './helpers.js';

const ctx = useTestApp();
const api = () => request(ctx.app);

const tokenFromMail = () => {
  const m = ctx.mails.at(-1)!.text.match(/token=([a-f0-9]{64})/);
  return m![1]!;
};

describe('US01 — cadastro com nome, e-mail e senha', () => {
  it('cria a conta e já devolve a sessão', async () => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ name: '  Ana Souza ', email: 'Ana@Email.com', password: 'Senha123' })
      .expect(201);
    expect(res.body.data.token).toEqual(expect.any(String));
    expect(res.body.data.user).toMatchObject({ name: 'Ana Souza', email: 'ana@email.com', role: 'user' });
    expect(res.body.data.user).not.toHaveProperty('password_hash');
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
  });

  it('US13 — guarda a senha só como hash bcrypt', async () => {
    await registerAndLogin(ctx, { password: 'Segredo123' });
    const { rows } = await ctx.deps.db.query<{ password_hash: string }>('SELECT password_hash FROM users');
    expect(rows[0]!.password_hash).toMatch(/^\$2[aby]\$12\$/);
    expect(rows[0]!.password_hash).not.toContain('Segredo123');
  });

  it('recusa e-mail repetido (sem diferenciar maiúsculas)', async () => {
    await registerAndLogin(ctx);
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ name: 'Outra', email: 'MARINA@email.com', password: 'Senha@123' })
      .expect(409);
    expect(res.body.error.code).toBe('email_taken');
  });

  it.each([
    [{ name: '', email: 'a@b.com', password: 'Senha123' }, 'name'],
    [{ name: 'A', email: 'nao-e-email', password: 'Senha123' }, 'email'],
    [{ name: 'A', email: 'a@b.com', password: 'curta1' }, 'password'],
    [{ name: 'A', email: 'a@b.com', password: 'semnumeros' }, 'password'],
    [{ name: 'A', email: 'a@b.com', password: '12345678' }, 'password'],
  ])('valida os campos (%o)', async (body, field) => {
    const res = await api().post('/api/v1/auth/register').send(body).expect(422);
    expect(res.body.error.details.map((d: { field: string }) => d.field)).toContain(field);
  });
});

describe('US02 — login com e-mail e senha', () => {
  it('entra com as credenciais certas e acessa os próprios dados', async () => {
    await registerAndLogin(ctx);
    const res = await api().post('/api/v1/auth/login').send({ email: ' marina@EMAIL.com ', password: 'Senha@123' }).expect(200);
    const me = await api().get('/api/v1/me').set(auth(res.body.data.token)).expect(200);
    expect(me.body.data.email).toBe('marina@email.com');
  });

  it('recusa senha errada e e-mail inexistente com a mesma mensagem', async () => {
    await registerAndLogin(ctx);
    const a = await api().post('/api/v1/auth/login').send({ email: 'marina@email.com', password: 'errada123' }).expect(401);
    const b = await api().post('/api/v1/auth/login').send({ email: 'ninguem@email.com', password: 'errada123' }).expect(401);
    expect(a.body.error.message).toBe('E-mail ou senha incorretos');
    expect(b.body.error.message).toBe(a.body.error.message);
  });

  it('rotas da conta exigem token válido', async () => {
    await api().get('/api/v1/me').expect(401);
    await api().get('/api/v1/me').set(auth('token-falso')).expect(401);
  });
});

describe('US03 — recuperar senha por e-mail', () => {
  it('envia o link por e-mail e permite criar uma nova senha', async () => {
    const { token: oldSession } = await registerAndLogin(ctx);
    await api().post('/api/v1/auth/forgot-password').send({ email: 'marina@email.com' }).expect(202);

    expect(ctx.mails).toHaveLength(1);
    expect(ctx.mails[0]!.to).toBe('marina@email.com');
    expect(ctx.mails[0]!.text).toContain('http://localhost:8081/reset-password?token=');

    const token = tokenFromMail();
    await api().post('/api/v1/auth/reset-password').send({ token, password: 'NovaSenha1' }).expect(204);
    await api().post('/api/v1/auth/login').send({ email: 'marina@email.com', password: 'NovaSenha1' }).expect(200);
    await api().post('/api/v1/auth/login').send({ email: 'marina@email.com', password: 'Senha@123' }).expect(401);
    // Sessões abertas antes da troca deixam de valer
    await api().get('/api/v1/me').set(auth(oldSession)).expect(401);
  });

  it('o link é de uso único', async () => {
    await registerAndLogin(ctx);
    await api().post('/api/v1/auth/forgot-password').send({ email: 'marina@email.com' }).expect(202);
    const token = tokenFromMail();
    await api().post('/api/v1/auth/reset-password').send({ token, password: 'NovaSenha1' }).expect(204);
    await api().post('/api/v1/auth/reset-password').send({ token, password: 'OutraSenha2' }).expect(400);
  });

  it('o link expira em 1 hora', async () => {
    await registerAndLogin(ctx);
    await api().post('/api/v1/auth/forgot-password').send({ email: 'marina@email.com' }).expect(202);
    ctx.now.value = new Date(ctx.now.value.getTime() + 61 * 60_000);
    const res = await api().post('/api/v1/auth/reset-password').send({ token: tokenFromMail(), password: 'NovaSenha1' }).expect(400);
    expect(res.body.error.message).toMatch(/expirado/);
  });

  it('não revela se o e-mail existe e não guarda o token em texto puro', async () => {
    await registerAndLogin(ctx);
    const res = await api().post('/api/v1/auth/forgot-password').send({ email: 'ninguem@email.com' }).expect(202);
    expect(res.body.data.message).toMatch(/Se o e-mail estiver cadastrado/);
    expect(ctx.mails).toHaveLength(0);

    await api().post('/api/v1/auth/forgot-password').send({ email: 'marina@email.com' }).expect(202);
    const { rows } = await ctx.deps.db.query<{ token_hash: string }>('SELECT token_hash FROM password_resets');
    expect(rows[0]!.token_hash).not.toBe(tokenFromMail());
    expect(rows[0]!.token_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('token inválido é recusado', async () => {
    // formato certo, mas não existe
    await api()
      .post('/api/v1/auth/reset-password')
      .send({ token: 'a'.repeat(64), password: 'NovaSenha1' })
      .expect(400);
    // formato errado: mensagem amigável, não técnica
    const res = await api().post('/api/v1/auth/reset-password').send({ token: 'abc', password: 'NovaSenha1' }).expect(422);
    expect(res.body.error.details[0].message).toBe('Link inválido ou expirado. Peça um novo.');
  });

  it('falha de SMTP vira erro 503 claro', async () => {
    await registerAndLogin(ctx);
    const original = ctx.deps.mailer.send;
    ctx.deps.mailer.send = async () => {
      throw new Error('SMTP fora do ar');
    };
    try {
      const res = await api().post('/api/v1/auth/forgot-password').send({ email: 'marina@email.com' }).expect(503);
      expect(res.body.error.code).toBe('mail_unavailable');
    } finally {
      ctx.deps.mailer.send = original;
    }
  });
});
