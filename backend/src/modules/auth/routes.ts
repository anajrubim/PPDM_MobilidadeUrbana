import { createHash, randomBytes } from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { Deps } from '../../app.js';
import type { Queryable } from '../../db/pool.js';
import { signAccessToken } from '../../lib/auth.js';
import { AppError, badRequest, unauthorized } from '../../lib/errors.js';
import { parse, personName } from '../../lib/http.js';
import { DUMMY_HASH, hashPassword, passwordSchema, verifyPassword } from '../../lib/password.js';
import { findUserByEmail, toPublicUser, type UserRow } from './user-repo.js';

const RESET_TTL_MS = 60 * 60 * 1000;
// Espaços nas pontas (comuns no autocompletar do celular) e maiúsculas não impedem o login
export const emailSchema = z.preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v), z.email('E-mail inválido').max(254));

const registerSchema = z.object({
  name: personName,
  email: emailSchema,
  password: passwordSchema,
});
const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, 'Informe a senha').max(128) });

export const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

export function sessionFor(secret: string, user: UserRow) {
  return {
    token: signAccessToken(secret, { id: user.id, role: user.role, tokenVersion: user.token_version }),
    user: toPublicUser(user),
  };
}

/** Invalida todos os links de redefinição ainda abertos do usuário (depois de trocar a senha). */
export async function invalidateResetLinks(db: Queryable, userId: string, at: Date): Promise<void> {
  await db.query('UPDATE password_resets SET used_at = $2 WHERE user_id = $1 AND used_at IS NULL', [userId, at]);
}

/** Monta o link do e-mail: `https://app/reset-password?token=…` ou `mobilidade://reset-password?token=…`. */
export function resetLink(base: string, token: string): string {
  return `${base}${base.includes('?') ? '&' : '?'}token=${token}`;
}

/** US01 cadastro, US02 login, US03 recuperação de senha por e-mail. */
export function authRoutes(deps: Deps): Router {
  const { db, config, mailer, clock, logger } = deps;
  const r = Router();

  // Limita força bruta de senha e abuso do envio de e-mails
  r.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      // Em desenvolvimento os testes ponta a ponta fazem muitos logins seguidos
      limit: config.NODE_ENV === 'production' ? 30 : 1000,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      skip: () => config.NODE_ENV === 'test',
      handler: (_req, res) => res.status(429).json({ error: { code: 'rate_limited', message: 'Muitas tentativas. Tente mais tarde.' } }),
    }),
  );

  r.post('/register', async (req, res) => {
    const body = parse(registerSchema, req.body);
    if (await findUserByEmail(db, body.email)) throw new AppError(409, 'email_taken', 'E-mail já cadastrado');
    const hash = await hashPassword(body.password);
    const { rows } = await db
      .query<UserRow>('INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING *', [body.name, body.email, hash])
      .catch((err: { code?: string }) => {
        // Dois cadastros simultâneos com o mesmo e-mail: o índice único barra o segundo
        if (err.code === '23505') throw new AppError(409, 'email_taken', 'E-mail já cadastrado');
        throw err;
      });
    res
      .status(201)
      .location('/api/v1/me')
      .json({ data: sessionFor(config.JWT_SECRET, rows[0]!) });
  });

  r.post('/login', async (req, res) => {
    const body = parse(loginSchema, req.body);
    const user = await findUserByEmail(db, body.email);
    // Compara com um hash falso quando o e-mail não existe: o tempo de resposta não denuncia contas
    const ok = await verifyPassword(body.password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !ok) throw unauthorized('E-mail ou senha incorretos');
    res.json({ data: sessionFor(config.JWT_SECRET, user) });
  });

  r.post('/forgot-password', async (req, res) => {
    const { email } = parse(z.object({ email: emailSchema }), req.body);
    const user = await findUserByEmail(db, email);
    if (user) {
      const token = randomBytes(32).toString('hex');
      await db.query('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [
        sha256(token),
        user.id,
        new Date(clock().getTime() + RESET_TTL_MS),
      ]);
      const link = resetLink(config.PUBLIC_APP_URL, token);
      try {
        await mailer.send({
          to: user.email,
          subject: 'Redefinição de senha — Mobilidade Urbana',
          text:
            `Olá, ${user.name}.\n\nRecebemos um pedido para redefinir a senha da sua conta.\n` +
            `Para criar uma nova senha, abra o link abaixo (válido por 1 hora):\n\n${link}\n\n` +
            'Se não foi você, ignore este e-mail: sua senha continua a mesma.',
        });
      } catch (err) {
        logger.error({ err }, 'falha ao enviar e-mail de redefinição');
        throw new AppError(503, 'mail_unavailable', 'Não foi possível enviar o e-mail agora. Tente novamente.');
      }
    }
    // Mesma resposta exista ou não a conta (não revela e-mails cadastrados)
    res.status(202).json({ data: { message: 'Se o e-mail estiver cadastrado, enviaremos um link.' } });
  });

  r.post('/reset-password', async (req, res) => {
    const body = parse(
      z.object({ token: z.string().regex(/^[a-f0-9]{64}$/, 'Link inválido ou expirado. Peça um novo.'), password: passwordSchema }),
      req.body,
    );
    const hash = await hashPassword(body.password);
    // Uso único: marca como usado na mesma instrução que valida
    const { rows } = await db.query<{ user_id: string }>(
      `UPDATE password_resets SET used_at = $2
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > $2
        RETURNING user_id`,
      [sha256(body.token), clock()],
    );
    const row = rows[0];
    if (!row) throw badRequest('Link inválido ou expirado. Peça um novo.');
    await db.query('UPDATE users SET password_hash = $1, token_version = token_version + 1, updated_at = now() WHERE id = $2', [
      hash,
      row.user_id,
    ]);
    // Outros links pedidos antes deixam de valer
    await invalidateResetLinks(db, row.user_id, clock());
    res.status(204).end();
  });

  return r;
}
