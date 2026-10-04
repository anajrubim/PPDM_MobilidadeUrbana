import bcrypt from 'bcryptjs';
import { z } from 'zod';

const ROUNDS = 12;

/** O bcrypt só considera os primeiros 72 bytes: senhas maiores seriam iguais a partir daí. */
export const PASSWORD_MAX_BYTES = 72;

export const passwordSchema = z
  .string()
  .min(8, 'A senha precisa ter ao menos 8 caracteres')
  .refine((v) => Buffer.byteLength(v, 'utf8') <= PASSWORD_MAX_BYTES, 'A senha pode ter no máximo 72 caracteres')
  .regex(/[A-Za-z]/, 'A senha precisa ter letras')
  .regex(/[0-9]/, 'A senha precisa ter números');

export const hashPassword = (plain: string) => bcrypt.hash(plain, ROUNDS);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

// Hash real (calculado uma vez) usado quando o e-mail não existe, para igualar o tempo de resposta
export const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', ROUNDS);
