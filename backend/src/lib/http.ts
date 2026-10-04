import type { NextFunction, Request, Response } from 'express';
import type { Logger } from 'pino';
import { z } from 'zod';
import { AppError } from './errors.js';

// Mensagens de validação padrão do Zod em português (as que não têm texto próprio)
z.config(z.locales.ptBR());

export function parse<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError(
      422,
      'validation_error',
      'Dados inválidos',
      result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    );
  }
  return result.data;
}

/** Ids do banco (INTEGER): acima de 2^31−1 o PostgreSQL recusaria com erro 500. */
export const MAX_DB_ID = 2_147_483_647;
export const idParam = z.coerce.number().int().positive().max(MAX_DB_ID, 'Id inválido');
export const dbId = z.number().int().positive().max(MAX_DB_ID, 'Id inválido');

/**
 * Nome de pessoa: remove caracteres de controle e invisíveis (zero-width, direção de texto),
 * junta espaços repetidos e exige ao menos uma letra.
 */
export const personName = z
  .string()
  .transform((v) =>
    v
      .replace(/[\p{Cc}\p{Cf}]/gu, '')
      .replace(/\s+/g, ' ')
      .trim(),
  )
  .pipe(
    z.string().min(1, 'Informe seu nome').max(100, 'O nome pode ter no máximo 100 caracteres').regex(/\p{L}/u, 'O nome precisa ter letras'),
  );

export function errorHandler(logger: Logger) {
  // O Express reconhece o tratador de erro pelos 4 parâmetros
  return (err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
      return;
    }
    const e = err as { type?: string; code?: string; status?: number };
    if (e?.type === 'entity.parse.failed') {
      res.status(400).json({ error: { code: 'invalid_json', message: 'JSON inválido' } });
      return;
    }
    if (e?.type === 'entity.too.large') {
      res.status(413).json({ error: { code: 'payload_too_large', message: 'Corpo da requisição muito grande' } });
      return;
    }
    if (e?.code === '23505') {
      res.status(409).json({ error: { code: 'conflict', message: 'Registro duplicado' } });
      return;
    }
    if (e?.code === '23503') {
      res.status(409).json({ error: { code: 'integrity_violation', message: 'Registro possui vínculos' } });
      return;
    }
    logger.error({ err, path: req.path }, 'erro não tratado');
    res.status(500).json({ error: { code: 'internal_error', message: 'Erro interno' } });
  };
}
