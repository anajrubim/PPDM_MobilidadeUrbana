import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Queryable } from '../db/pool.js';
import { unauthorized } from './errors.js';

export type Role = 'user' | 'admin';
export interface AuthUser {
  id: string;
  role: Role;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

interface AccessClaims {
  sub: string;
  role: Role;
  tv: number;
  purpose: 'access';
}

const ACCESS_TTL = '30d';

export function signAccessToken(secret: string, user: { id: string; role: Role; tokenVersion: number }): string {
  const claims: Omit<AccessClaims, 'sub'> = { role: user.role, tv: user.tokenVersion, purpose: 'access' };
  return jwt.sign(claims, secret, { subject: user.id, expiresIn: ACCESS_TTL, algorithm: 'HS256' });
}

export function decodeAccessToken(secret: string, token: string): AccessClaims | null {
  try {
    const claims = jwt.verify(token, secret, { algorithms: ['HS256'] }) as AccessClaims;
    return claims.purpose === 'access' ? claims : null;
  } catch {
    return null;
  }
}

function bearer(req: Request): string | null {
  const h = req.headers.authorization;
  return h?.startsWith('Bearer ') ? h.slice(7) : null;
}

/** Autentica o token e confere a versão (senha trocada invalida sessões antigas). */
export async function authenticate(db: Queryable, secret: string, token: string): Promise<AuthUser | null> {
  const claims = decodeAccessToken(secret, token);
  if (!claims) return null;
  const { rows } = await db.query<{ role: Role; token_version: number }>('SELECT role, token_version FROM users WHERE id = $1', [
    claims.sub,
  ]);
  const row = rows[0];
  if (!row || row.token_version !== claims.tv) return null;
  return { id: claims.sub, role: row.role };
}

export function authMiddleware(db: Queryable, secret: string, opts: { optional?: boolean } = {}) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const token = bearer(req);
    if (!token) {
      if (opts.optional) return next();
      return next(unauthorized());
    }
    const user = await authenticate(db, secret, token);
    if (!user) return next(unauthorized('Sessão inválida ou expirada'));
    req.user = user;
    next();
  };
}

export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
