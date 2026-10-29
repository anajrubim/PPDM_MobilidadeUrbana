import type { Queryable } from '../../db/pool.js';
import type { PushSender } from './push.js';

export type NotificationType = 'delay' | 'service_alert' | 'proximity' | 'report' | 'share' | 'system';

export interface NewNotification {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  lineId?: number | null;
  stopId?: number | null;
  data?: Record<string, unknown>;
  /** Mesma chave para o mesmo usuário = não repete. */
  dedupeKey?: string;
  at: Date;
}

export interface NotificationRow {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  line_id: number | null;
  stop_id: number | null;
  data: Record<string, unknown>;
  read_at: Date | null;
  created_at: Date;
}

export const notificationDto = (n: NotificationRow) => ({
  id: n.id,
  type: n.type,
  title: n.title,
  body: n.body,
  lineId: n.line_id,
  stopId: n.stop_id,
  data: n.data,
  read: n.read_at !== null,
  createdAt: n.created_at.toISOString(),
});

/** Quantas notificações cada usuário guarda no histórico (as mais antigas saem). */
export const HISTORY_LIMIT = 200;

/**
 * Grava a notificação (histórico, US20) e dispara o push (US17) — só se ela for nova.
 * Devolve a notificação criada, ou null se já existia (mesma dedupeKey).
 */
export async function notify(db: Queryable, push: PushSender, n: NewNotification): Promise<NotificationRow | null> {
  const { rows } = await db.query<NotificationRow>(
    `INSERT INTO notifications (user_id, type, title, body, line_id, stop_id, data, dedupe_key, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
     RETURNING *`,
    [n.userId, n.type, n.title, n.body, n.lineId ?? null, n.stopId ?? null, JSON.stringify(n.data ?? {}), n.dedupeKey ?? null, n.at],
  );
  const created = rows[0];
  if (!created) return null;
  // Mantém o histórico limitado
  await db.query(
    `DELETE FROM notifications WHERE user_id = $1 AND id IN (
       SELECT id FROM notifications WHERE user_id = $1 ORDER BY created_at DESC, id OFFSET $2)`,
    [n.userId, HISTORY_LIMIT],
  );
  if (push.enabled) {
    const devices = await db.query<{ token: string }>('SELECT token FROM push_devices WHERE user_id = $1', [n.userId]);
    if (devices.rows.length) {
      await push.send(
        devices.rows.map((d) => d.token),
        { title: n.title, body: n.body, data: { notificationId: created.id, type: n.type, lineId: n.lineId, stopId: n.stopId } },
      );
    }
  }
  return created;
}
