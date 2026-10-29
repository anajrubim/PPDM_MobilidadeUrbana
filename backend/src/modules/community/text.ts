import { z } from 'zod';

/**
 * Texto livre de usuário (comentário, descrição): remove caracteres de controle e invisíveis,
 * normaliza espaços e quebras de linha. Vazio vira null.
 */
export const cleanText = (max: number) =>
  z
    .string()
    .transform((v) =>
      v
        .replace(/\r\n?/g, '\n')
        // mantém \n; tira os demais controles (\p{Cc}) e formatos invisíveis (\p{Cf}: zero-width, direção de texto)
        .replace(/[^\S\n]+/g, ' ')
        .replace(/(?!\n)[\p{Cc}\p{Cf}]/gu, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim(),
    )
    .pipe(z.string().max(max, `O texto pode ter no máximo ${max} caracteres`))
    .transform((v) => (v === '' ? null : v));

/** Nome exibido publicamente: primeiro nome + inicial do sobrenome ("Marina A."). */
export function publicAuthor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Usuário';
  const first = parts[0]!;
  const last = parts.length > 1 ? ` ${parts.at(-1)![0]!.toUpperCase()}.` : '';
  return `${first}${last}`;
}
