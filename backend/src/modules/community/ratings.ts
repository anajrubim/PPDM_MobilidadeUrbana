import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Deps } from '../../app.js';
import type { Queryable } from '../../db/pool.js';
import { currentUser } from '../../lib/auth.js';
import { AppError, notFound } from '../../lib/errors.js';
import { idParam, parse } from '../../lib/http.js';
import type { NetworkCache } from '../transit/network.js';
import { cleanText, publicAuthor } from './text.js';

export interface RatingSummary {
  average: number | null;
  count: number;
}

/** US22 — média e total de avaliações de todas as linhas (uma consulta só, para a lista de linhas). */
export async function ratingSummaries(db: Queryable): Promise<Map<number, RatingSummary>> {
  const { rows } = await db.query<{ line_id: number; avg: number; n: number }>(
    'SELECT line_id, round(avg(score)::numeric, 1)::float AS avg, count(*)::int AS n FROM line_ratings GROUP BY line_id',
  );
  return new Map(rows.map((r) => [r.line_id, { average: r.avg, count: r.n }]));
}

async function lineRating(db: Queryable, lineId: number) {
  const { rows } = await db.query<{ avg: number | null; n: number; s1: number; s2: number; s3: number; s4: number; s5: number }>(
    `SELECT round(avg(score)::numeric, 1)::float AS avg, count(*)::int AS n,
            count(*) FILTER (WHERE score = 1)::int AS s1, count(*) FILTER (WHERE score = 2)::int AS s2,
            count(*) FILTER (WHERE score = 3)::int AS s3, count(*) FILTER (WHERE score = 4)::int AS s4,
            count(*) FILTER (WHERE score = 5)::int AS s5
       FROM line_ratings WHERE line_id = $1`,
    [lineId],
  );
  const r = rows[0]!;
  return { average: r.avg, count: r.n, distribution: { 1: r.s1, 2: r.s2, 3: r.s3, 4: r.s4, 5: r.s5 } };
}

interface RatingRow {
  user_id: string;
  name: string;
  score: number;
  comment: string | null;
  created_at: Date;
  updated_at: Date;
}

const ratingDto = (r: RatingRow, me?: string) => ({
  score: r.score,
  comment: r.comment,
  author: publicAuthor(r.name),
  mine: r.user_id === me,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
});

/** US21 avaliar linha (nota + comentário, US76) e US22 média por linha. */
export function ratingRoutes(deps: Deps, cache: NetworkCache, requireAuth: RequestHandler) {
  const { db, clock } = deps;
  const r = Router();

  const lineOr404 = async (raw: unknown) => {
    const line = (await cache.get()).lineById.get(parse(idParam, raw));
    if (!line) throw notFound('Linha');
    return line;
  };

  // Resumo + comentários mais recentes (público; logado, marca a avaliação do próprio usuário)
  r.get('/lines/:id/ratings', async (req, res) => {
    const line = await lineOr404(req.params.id);
    const q = parse(
      z.object({ limit: z.coerce.number().int().min(1).max(50).default(20), before: z.iso.datetime({ offset: true }).optional() }),
      req.query,
    );
    const me = req.user?.id;
    const params: unknown[] = [line.id, q.limit];
    const before = q.before ? `AND r.updated_at < $${params.push(q.before)}` : '';
    const [summary, items, mine] = await Promise.all([
      lineRating(db, line.id),
      db.query<RatingRow>(
        `SELECT r.*, u.name FROM line_ratings r JOIN users u ON u.id = r.user_id
          WHERE r.line_id = $1 AND r.comment IS NOT NULL ${before}
          ORDER BY r.updated_at DESC LIMIT $2`,
        params,
      ),
      me
        ? db.query<RatingRow>('SELECT r.*, u.name FROM line_ratings r JOIN users u ON u.id = r.user_id WHERE r.line_id = $1 AND r.user_id = $2', [
            line.id,
            me,
          ])
        : Promise.resolve({ rows: [] as RatingRow[] }),
    ]);
    res.json({
      data: {
        line: { id: line.id, code: line.code, name: line.name },
        summary,
        mine: mine.rows[0] ? ratingDto(mine.rows[0], me) : null,
        items: items.rows.map((row) => ratingDto(row, me)),
      },
    });
  });

  // Uma avaliação por usuário e linha: avaliar de novo substitui a anterior
  r.put('/lines/:id/rating', requireAuth, async (req, res) => {
    const line = await lineOr404(req.params.id);
    const b = parse(
      z.object({
        score: z.number().int('A nota é de 1 a 5').min(1, 'A nota é de 1 a 5').max(5, 'A nota é de 1 a 5'),
        comment: cleanText(500).nullable().optional(),
      }),
      req.body,
    );
    if (line.status !== 'active') throw new AppError(409, 'line_inactive', 'Esta linha está desativada');
    const userId = currentUser(req).id;
    const { rows } = await db.query<RatingRow & { inserted: boolean }>(
      `WITH up AS (
         INSERT INTO line_ratings (user_id, line_id, score, comment, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $5)
         ON CONFLICT (user_id, line_id) DO UPDATE SET score = EXCLUDED.score, comment = EXCLUDED.comment, updated_at = EXCLUDED.updated_at
         RETURNING *, (xmax = 0) AS inserted)
       SELECT up.*, u.name FROM up JOIN users u ON u.id = up.user_id`,
      [userId, line.id, b.score, b.comment || null, clock()],
    );
    const row = rows[0]!;
    res.status(row.inserted ? 201 : 200).json({ data: { rating: ratingDto(row, userId), summary: await lineRating(db, line.id) } });
  });

  r.delete('/lines/:id/rating', requireAuth, async (req, res) => {
    const line = await lineOr404(req.params.id);
    await db.query('DELETE FROM line_ratings WHERE user_id = $1 AND line_id = $2', [currentUser(req).id, line.id]);
    res.status(204).end();
  });

  return r;
}
