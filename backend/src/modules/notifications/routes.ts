import { Router } from 'express';
import { z } from 'zod';
import type { Deps } from '../../app.js';
import { currentUser } from '../../lib/auth.js';
import { notFound } from '../../lib/errors.js';
import { parse } from '../../lib/http.js';
import { notificationDto, type NotificationRow } from './service.js';

const uuid = z.uuid('Id inválido');
export const MAX_DEVICES = 10;

/** US17 (preferências e aparelhos) e US20 (histórico de notificações). Montado em /me. */
export function notificationRoutes(deps: Deps): Router {
  const { db, clock } = deps;
  const r = Router();

  // ---------- Histórico (US20) ----------
  r.get('/notifications', async (req, res) => {
    const q = parse(
      z.object({
        unread: z.enum(['true', 'false']).optional(),
        type: z.enum(['delay', 'service_alert', 'proximity', 'report', 'share', 'system']).optional(),
        before: z.iso.datetime({ offset: true }).optional(),
        /** Só as criadas depois deste instante (o app busca as novas a cada poucos segundos). */
        since: z.iso.datetime({ offset: true }).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      }),
      req.query,
    );
    const userId = currentUser(req).id;
    const where = ['user_id = $1'];
    const params: unknown[] = [userId];
    if (q.unread === 'true') where.push('read_at IS NULL');
    if (q.type) where.push(`type = $${params.push(q.type)}`);
    if (q.before) where.push(`created_at < $${params.push(q.before)}`);
    if (q.since) where.push(`created_at > $${params.push(q.since)}`);
    const [items, unread] = await Promise.all([
      db.query<NotificationRow>(
        `SELECT * FROM notifications WHERE ${where.join(' AND ')} ORDER BY created_at DESC, id LIMIT $${params.push(q.limit)}`,
        params,
      ),
      db.query<{ n: number }>('SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [userId]),
    ]);
    res.json({ data: { items: items.rows.map(notificationDto), unread: unread.rows[0]!.n } });
  });

  // Marca como lidas: as indicadas ou todas
  r.post('/notifications/read', async (req, res) => {
    const body = parse(z.object({ ids: z.array(uuid).max(200).optional(), all: z.boolean().optional() }), req.body);
    const userId = currentUser(req).id;
    if (body.all) await db.query('UPDATE notifications SET read_at = $2 WHERE user_id = $1 AND read_at IS NULL', [userId, clock()]);
    else if (body.ids?.length) {
      await db.query('UPDATE notifications SET read_at = $3 WHERE user_id = $1 AND id = ANY($2::uuid[]) AND read_at IS NULL', [
        userId,
        body.ids,
        clock(),
      ]);
    }
    const { rows } = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [
      userId,
    ]);
    res.json({ data: { unread: rows[0]!.n } });
  });

  r.delete('/notifications/:id', async (req, res) => {
    const { rowCount } = await db.query('DELETE FROM notifications WHERE id = $1 AND user_id = $2', [
      parse(uuid, req.params.id),
      currentUser(req).id,
    ]);
    if (!rowCount) throw notFound('Notificação');
    res.status(204).end();
  });

  // Limpa o histórico
  r.delete('/notifications', async (req, res) => {
    await db.query('DELETE FROM notifications WHERE user_id = $1', [currentUser(req).id]);
    res.status(204).end();
  });

  // ---------- Preferências (US17) ----------
  const prefsDto = (p: { notify_delays: boolean; notify_service_alerts: boolean; notify_proximity: boolean }) => ({
    delays: p.notify_delays,
    serviceAlerts: p.notify_service_alerts,
    proximity: p.notify_proximity,
  });

  r.get('/notification-settings', async (req, res) => {
    const { rows } = await db.query('SELECT notify_delays, notify_service_alerts, notify_proximity FROM users WHERE id = $1', [
      currentUser(req).id,
    ]);
    res.json({ data: prefsDto(rows[0]) });
  });

  r.patch('/notification-settings', async (req, res) => {
    const b = parse(
      z.object({ delays: z.boolean().optional(), serviceAlerts: z.boolean().optional(), proximity: z.boolean().optional() }).strict(),
      req.body,
    );
    const { rows } = await db.query(
      `UPDATE users SET notify_delays = COALESCE($2, notify_delays),
                        notify_service_alerts = COALESCE($3, notify_service_alerts),
                        notify_proximity = COALESCE($4, notify_proximity)
        WHERE id = $1 RETURNING notify_delays, notify_service_alerts, notify_proximity`,
      [currentUser(req).id, b.delays ?? null, b.serviceAlerts ?? null, b.proximity ?? null],
    );
    res.json({ data: prefsDto(rows[0]) });
  });

  // ---------- Aparelhos para push (US17) ----------
  r.put('/devices', async (req, res) => {
    const b = parse(z.object({ token: z.string().trim().min(10).max(300), platform: z.enum(['android', 'ios', 'web']) }), req.body);
    // O mesmo aparelho pode trocar de conta: o token passa a ser da conta atual
    await db.query(
      `INSERT INTO push_devices (token, user_id, platform, updated_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, updated_at = EXCLUDED.updated_at`,
      [b.token, currentUser(req).id, b.platform, clock()],
    );
    // No máximo 10 aparelhos por conta (os mais antigos saem)
    await db.query(
      `DELETE FROM push_devices WHERE user_id = $1 AND token IN (
         SELECT token FROM push_devices WHERE user_id = $1 ORDER BY updated_at DESC OFFSET $2)`,
      [currentUser(req).id, MAX_DEVICES],
    );
    res.status(204).end();
  });

  r.delete('/devices', async (req, res) => {
    const b = parse(z.object({ token: z.string().trim().min(10).max(300) }), req.body);
    await db.query('DELETE FROM push_devices WHERE token = $1 AND user_id = $2', [b.token, currentUser(req).id]);
    res.status(204).end();
  });

  return r;
}
