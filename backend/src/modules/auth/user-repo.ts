import type { Queryable } from '../../db/pool.js';
import type { Role } from '../../lib/auth.js';

export interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: Role;
  token_version: number;
  created_at: Date;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
}

/** Nunca devolve o hash da senha para o cliente. */
export function toPublicUser(u: UserRow): PublicUser {
  return { id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.created_at.toISOString() };
}

export async function findUserByEmail(db: Queryable, email: string): Promise<UserRow | undefined> {
  const { rows } = await db.query<UserRow>('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
  return rows[0];
}

export async function findUserById(db: Queryable, id: string): Promise<UserRow | undefined> {
  const { rows } = await db.query<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0];
}
