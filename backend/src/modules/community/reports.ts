import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Deps } from '../../app.js';
import { withTransaction } from '../../db/pool.js';
import { currentUser } from '../../lib/auth.js';
import { AppError, badRequest, notFound } from '../../lib/errors.js';
import { dbId, idParam, parse } from '../../lib/http.js';
import { notify } from '../notifications/service.js';
import type { NetworkCache } from '../transit/network.js';
import { cleanText } from './text.js';

export const REPORT_CATEGORIES = ['overcrowding', 'delay', 'vehicle', 'driver', 'cleanliness', 'safety', 'stop', 'other'] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<ReportCategory, string> = {
  overcrowding: 'Superlotação',
  delay: 'Atraso grande',
  vehicle: 'Veículo com defeito',
  driver: 'Comportamento do motorista',
  cleanliness: 'Falta de limpeza',
  safety: 'Segurança',
  stop: 'Problema no ponto',
  other: 'Outro',
};

/** Limites contra abuso: por usuário, por hora; e a mesma denúncia repetida em pouco tempo. */
export const MAX_REPORTS_PER_HOUR = 10;
const DUPLICATE_WINDOW_MIN = 30;

interface ReportRow {
  id: string;
  protocol: string;
  user_id: string;
  line_id: number;
  stop_id: number | null;
  category: ReportCategory;
  description: string | null;
  status: 'received' | 'in_review' | 'resolved' | 'dismissed';
  created_at: Date;
  supporters?: number;
  supported?: boolean;
}

/** US23 denunciar, US24 ver denúncias de outros usuários, US25 confirmação com protocolo. */
export function reportRoutes(deps: Deps, cache: NetworkCache, requireAuth: RequestHandler): Router {
  const { db, clock } = deps;
  const push = deps.push;
  const r = Router();

  const dto = async (row: ReportRow, me?: string) => {
    const net = await cache.get();
    const line = net.lineById.get(row.line_id);
    const stop = row.stop_id ? net.stops.get(row.stop_id) : undefined;
    return {
      id: row.id,
      protocol: row.user_id === me ? row.protocol : undefined,
      line: line ? { id: line.id, code: line.code, name: line.name, color: line.color } : null,
      stop: stop ? { id: stop.id, name: stop.name } : null,
      category: row.category,
      categoryLabel: CATEGORY_LABEL[row.category],
      description: row.description,
      status: row.status,
      // A denúncia em si + quem confirmou ("também passei por isso")
      people: 1 + (row.supporters ?? 0),
      supportedByMe: !!row.supported,
      mine: row.user_id === me,
      createdAt: row.created_at.toISOString(),
    };
  };

  // ---------- US23 + US25 ----------
  r.post('/reports', requireAuth, async (req, res) => {
    const b = parse(
      z.object({
        lineId: dbId,
        stopId: dbId.nullable().optional(),
        category: z.enum(REPORT_CATEGORIES, 'Escolha o tipo de problema'),
        description: cleanText(1000).nullable().optional(),
      }),
      req.body,
    );
    if (b.category === 'other' && !b.description) {
      throw new AppError(422, 'validation_error', 'Dados inválidos', [{ field: 'description', message: 'Descreva o problema' }]);
    }
    const net = await cache.get();
    const line = net.lineById.get(b.lineId);
    if (!line) throw notFound('Linha');
    if (b.stopId != null && !line.stops.some((s) => s.stopId === b.stopId)) throw badRequest('Essa parada não é da linha escolhida');
    const userId = currentUser(req).id;
    const now = clock();

    const row = await withTransaction(deps.db, async (c) => {
      // Serializa as denúncias do mesmo usuário: os limites abaixo não podem ser furados em paralelo
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`report:${userId}`]);
      const recent = await c.query<{ n: number; dup: number }>(
        `SELECT count(*)::int AS n,
                count(*) FILTER (WHERE line_id = $3 AND category = $4 AND created_at > $2::timestamptz - make_interval(mins => $5))::int AS dup
           FROM reports WHERE user_id = $1 AND created_at > $2::timestamptz - interval '1 hour'`,
        [userId, now, line.id, b.category, DUPLICATE_WINDOW_MIN],
      );
      if (recent.rows[0]!.dup > 0) {
        throw new AppError(409, 'duplicate_report', 'Você já fez esta denúncia há pouco. Ela já está registrada.');
      }
      if (recent.rows[0]!.n >= MAX_REPORTS_PER_HOUR) {
        throw new AppError(429, 'rate_limited', 'Muitas denúncias em pouco tempo. Tente mais tarde.');
      }
      const seq = await c.query<{ n: number }>("SELECT nextval('report_protocol_seq')::int AS n");
      const protocol = `DEN-${now.getUTCFullYear()}-${String(seq.rows[0]!.n).padStart(6, '0')}`;
      const ins = await c.query<ReportRow>(
        `INSERT INTO reports (protocol, user_id, line_id, stop_id, category, description, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [protocol, userId, line.id, b.stopId ?? null, b.category, b.description ?? null, now],
      );
      return ins.rows[0]!;
    });

    // US25 — confirmação também fica no histórico de notificações
    await notify(db, push, {
      userId,
      type: 'report',
      title: 'Denúncia registrada',
      body: `Recebemos sua denúncia (${CATEGORY_LABEL[row.category].toLowerCase()}) sobre a linha ${line.code}. Protocolo ${row.protocol}.`,
      lineId: line.id,
      stopId: row.stop_id,
      data: { reportId: row.id, protocol: row.protocol },
      dedupeKey: `report:${row.id}`,
      at: now,
    });
    res.status(201).json({ data: await dto(row, userId) });
  });

  r.get('/me/reports', requireAuth, async (req, res) => {
    const userId = currentUser(req).id;
    const { rows } = await db.query<ReportRow>(
      `SELECT r.*, (SELECT count(*)::int FROM report_supports s WHERE s.report_id = r.id) AS supporters
         FROM reports r WHERE r.user_id = $1 ORDER BY r.created_at DESC LIMIT 100`,
      [userId],
    );
    res.json({ data: await Promise.all(rows.map((row) => dto(row, userId))) });
  });

  // ---------- US24 — denúncias da linha (públicas, sem identificar quem denunciou) ----------
  r.get('/lines/:id/reports', async (req, res) => {
    const line = (await cache.get()).lineById.get(parse(idParam, req.params.id));
    if (!line) throw notFound('Linha');
    const q = parse(z.object({ days: z.coerce.number().int().min(1).max(90).default(7) }), req.query);
    const me = req.user?.id ?? null;
    const now = clock();
    const { rows } = await db.query<ReportRow>(
      `SELECT r.*,
              (SELECT count(*)::int FROM report_supports s WHERE s.report_id = r.id) AS supporters,
              EXISTS (SELECT 1 FROM report_supports s WHERE s.report_id = r.id AND s.user_id = $4) AS supported
         FROM reports r
        WHERE r.line_id = $1 AND r.created_at > $2::timestamptz - make_interval(days => $3) AND r.status <> 'dismissed'
        ORDER BY r.created_at DESC LIMIT 100`,
      [line.id, now, q.days, me],
    );
    const items = await Promise.all(rows.map((row) => dto(row, me ?? undefined)));
    // Resumo por tipo de problema: quantas denúncias e quantas pessoas
    const byCat = new Map<ReportCategory, { category: ReportCategory; label: string; reports: number; people: number; lastAt: string }>();
    for (const it of items) {
      const cur = byCat.get(it.category) ?? { category: it.category, label: it.categoryLabel, reports: 0, people: 0, lastAt: it.createdAt };
      cur.reports++;
      cur.people += it.people;
      if (it.createdAt > cur.lastAt) cur.lastAt = it.createdAt;
      byCat.set(it.category, cur);
    }
    res.json({
      data: {
        line: { id: line.id, code: line.code, name: line.name },
        days: q.days,
        total: items.length,
        summary: [...byCat.values()].sort((a, b) => b.people - a.people || b.lastAt.localeCompare(a.lastAt)),
        items,
      },
    });
  });

  // "Também passei por isso"
  r.put('/reports/:id/support', requireAuth, async (req, res) => {
    const id = parse(z.uuid('Id inválido'), req.params.id);
    const userId = currentUser(req).id;
    const { rows } = await db.query<{ user_id: string }>('SELECT user_id FROM reports WHERE id = $1', [id]);
    if (!rows[0]) throw notFound('Denúncia');
    if (rows[0].user_id === userId) throw badRequest('Você é o autor desta denúncia');
    await db.query('INSERT INTO report_supports (report_id, user_id, created_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [id, userId, clock()]);
    res.status(204).end();
  });

  r.delete('/reports/:id/support', requireAuth, async (req, res) => {
    await db.query('DELETE FROM report_supports WHERE report_id = $1 AND user_id = $2', [parse(z.uuid('Id inválido'), req.params.id), currentUser(req).id]);
    res.status(204).end();
  });

  return r;
}
