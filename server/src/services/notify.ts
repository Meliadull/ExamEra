import { all, get, now, run } from '../db.js';

/**
 * Notifications are stored as a type + params; the client renders the localized text.
 * `ref` deduplicates one-off notifications (e.g. one "deadline soon" reminder per assignment).
 */
export function notify(userId: number, type: string, params: Record<string, unknown>, link?: string, ref?: string) {
  if (ref && get('SELECT 1 FROM notifications WHERE user_id = ? AND ref = ?', userId, ref)) return;
  run(
    'INSERT INTO notifications (user_id, type, params, link, ref, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    userId,
    type,
    JSON.stringify(params),
    link ?? null,
    ref ?? null,
    now(),
  );
}

export function notifyAdmins(type: string, params: Record<string, unknown>, link?: string) {
  for (const a of all<{ id: number }>("SELECT id FROM users WHERE role = 'admin' AND status = 'active'")) {
    notify(a.id, type, params, link);
  }
}
