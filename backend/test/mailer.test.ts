import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createMailer } from '../src/lib/mailer.js';
import { resetLink } from '../src/modules/auth/routes.js';
import { useTestApp } from './helpers.js';

const ctx = useTestApp();

describe('US03 — envio de e-mail', () => {
  it('sem SMTP, guarda os e-mails na caixa de desenvolvimento', async () => {
    const mailer = createMailer('', 'x@y.z', pino({ level: 'silent' }));
    await mailer.send({ to: 'a@b.com', subject: 'Oi', text: 'Abra https://exemplo.com/?token=abc' });
    expect(mailer.outbox).toHaveLength(1);
    expect(mailer.outbox![0]).toMatchObject({ id: 1, to: 'a@b.com', subject: 'Oi' });
  });

  it('com SMTP configurado, não existe caixa local', () => {
    const mailer = createMailer('smtp://localhost:2525', 'x@y.z', pino({ level: 'silent' }));
    expect(mailer.outbox).toBeUndefined();
  });

  it('a caixa de desenvolvimento aparece em /dev/emails com o link clicável', async () => {
    const mailer = createMailer('', 'x@y.z', pino({ level: 'silent' }));
    const app = createApp({ ...ctx.deps, mailer });
    await request(app).post('/api/v1/auth/register').send({ name: 'Bia', email: 'bia@email.com', password: 'Senha123' }).expect(201);
    await request(app).post('/api/v1/auth/forgot-password').send({ email: 'bia@email.com' }).expect(202);
    const html = await request(app).get('/dev/emails').expect(200);
    expect(html.text).toContain('Redefinição de senha');
    expect(html.text).toMatch(/<a href="http:\/\/localhost:8081\/reset-password\?token=[a-f0-9]{64}">/);
    const json = await request(app).get('/api/v1/dev/emails').expect(200);
    expect(json.body.data[0].to).toBe('bia@email.com');
  });

  it('a caixa de desenvolvimento não existe em produção', async () => {
    const mailer = createMailer('', 'x@y.z', pino({ level: 'silent' }));
    const config = loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40), FORCE_HTTPS: 'false' });
    const app = createApp({ ...ctx.deps, config, mailer });
    await request(app).get('/dev/emails').expect(404);
  });

  it('monta o link com ou sem query string', () => {
    expect(resetLink('mobilidade://reset-password', 'abc')).toBe('mobilidade://reset-password?token=abc');
    expect(resetLink('https://app.com/r?x=1', 'abc')).toBe('https://app.com/r?x=1&token=abc');
  });
});

describe('caixa de e-mails só no próprio computador', () => {
  it('reconhece endereços locais', async () => {
    const { isLoopback } = await import('../src/lib/dev-mailbox.js');
    expect(['127.0.0.1', '::1', '::ffff:127.0.0.1'].every((a) => isLoopback(a))).toBe(true);
    expect(['192.168.0.10', '::ffff:192.168.0.10', '10.0.2.2', undefined].some((a) => isLoopback(a))).toBe(false);
  });
});
