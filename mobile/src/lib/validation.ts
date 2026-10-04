/** Limites iguais aos da API. */
export const LIMITS = { name: 100, email: 254, password: 72, search: 60 } as const;

/** Tamanho em bytes UTF-8 (o bcrypt da API só aceita senhas de até 72 bytes). */
export function utf8Bytes(s: string): number {
  let n = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
}

/** Remove caracteres invisíveis/de controle e junta espaços (como a API faz). */
export const cleanName = (v: string) =>
  v
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

export function passwordError(p: string): string | undefined {
  if (p.length < 8) return 'Mínimo de 8 caracteres';
  if (utf8Bytes(p) > LIMITS.password) return 'Máximo de 72 caracteres';
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return 'Use letras e números';
  return undefined;
}

export function nameError(n: string): string | undefined {
  const c = cleanName(n);
  if (!c) return 'Informe seu nome';
  if (!/\p{L}/u.test(c)) return 'O nome precisa ter letras';
  if (c.length > LIMITS.name) return 'Máximo de 100 caracteres';
  return undefined;
}

/** Validação local espelhando a API (feedback imediato). Exportada para testes. */
export function validateRegistration(v: { name: string; email: string; password: string }) {
  const errors: Partial<Record<'name' | 'email' | 'password', string>> = {};
  const name = nameError(v.name);
  if (name) errors.name = name;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) errors.email = 'E-mail inválido';
  const password = passwordError(v.password);
  if (password) errors.password = password;
  return errors;
}
