import { Router } from 'express';
import { z } from 'zod';
import { all, get, getSettings, now, run, tx, Where } from '../db.js';
import { badRequest, int, notFound, paging, parse, qstr, requireAuth, requireRole, user } from '../http.js';
import { seesEverything } from '../services/access.js';
import { audit } from '../services/audit.js';
import { backupFile, createBackup, listBackups } from '../services/backup.js';
import { COLS, fmtDate, sendTable } from '../services/export.js';

export const auditRouter = Router();
export const notificationsRouter = Router();
export const adminRouter = Router();
export const searchRouter = Router();

/* ---------- Audit log (read-only by design: there are no write endpoints) ---------- */

auditRouter.use(requireAuth, requireRole('admin', 'auditor', 'teacher'));

function auditWhere(req: Parameters<typeof user>[0]) {
  const me = user(req);
  const q = req.query as Record<string, string>;
  const w = new Where();
  if (me.role === 'teacher') {
    // Limited view: own actions and events on own tests.
    w.add(
      `(a.user_id = ? OR (a.entity_type = 'test' AND a.entity_id IN (SELECT CAST(id AS TEXT) FROM tests WHERE teacher_id = ?))
        OR (a.entity_type = 'attempt' AND a.entity_id IN (SELECT CAST(at.id AS TEXT) FROM attempts at JOIN tests t ON t.id = at.test_id WHERE t.teacher_id = ?)))`,
      me.id,
      me.id,
      me.id,
    );
  }
  if (q.userId) w.add('a.user_id = ?', int(q.userId));
  if (q.role) w.add('a.role = ?', q.role);
  if (q.action) w.add('a.action LIKE ?', q.action.endsWith('.') ? `${q.action}%` : q.action);
  if (q.entityType) w.add('a.entity_type = ?', q.entityType);
  if (q.entityId) w.add('a.entity_id = ?', q.entityId);
  if (q.result) w.add('a.result = ?', q.result);
  if (q.from) w.add('a.created_at >= ?', new Date(q.from).toISOString());
  if (q.to) w.add('a.created_at <= ?', new Date(Date.parse(q.to) + 86400_000 - 1).toISOString());
  const search = qstr(q.search);
  if (search) {
    const like = `%${search.toLowerCase()}%`;
    w.add('(LOWER(a.user_name) LIKE ? OR a.ip LIKE ? OR LOWER(a.metadata) LIKE ? OR a.event_id = ?)', like, like, like, search);
  }
  return w;
}

auditRouter.get('/', (req, res) => {
  const w = auditWhere(req);
  const { page, pageSize, offset } = paging(req.query as Record<string, unknown>, 50);
  const total = get<{ c: number }>(`SELECT COUNT(*) AS c FROM audit_log a ${w.sql}`, ...w.params)!.c;
  const items = all(`SELECT a.* FROM audit_log a ${w.sql} ORDER BY a.id DESC LIMIT ? OFFSET ?`, ...w.params, pageSize, offset);
  res.json({ total, page, pageSize, items });
});

auditRouter.get('/actions', (_req, res) => {
  res.json(all<{ action: string }>('SELECT DISTINCT action FROM audit_log ORDER BY action').map((r) => r.action));
});

auditRouter.get('/export', requireRole('admin', 'auditor'), async (req, res) => {
  const w = auditWhere(req);
  const format = req.query.format === 'csv' ? 'csv' : 'xlsx';
  const lang = req.query.lang === 'uz' ? 'uz' : 'ru';
  const rows = all<any>(`SELECT a.* FROM audit_log a ${w.sql} ORDER BY a.id DESC LIMIT 100000`, ...w.params);
  audit(req, 'data.export', { entityType: 'report', entityId: 'audit', metadata: { format, rows: rows.length } });
  const c = (key: string, ru: string, uz: string, width = 16) => ({ key, ru, uz, width });
  await sendTable(res, {
    format,
    lang,
    filename: 'examera-audit',
    columns: [
      c('event_id', 'ID события', 'Hodisa ID', 38),
      c('date', 'Дата и время', 'Sana va vaqt', 19),
      c('user_name', 'Пользователь', 'Foydalanuvchi', 24),
      c('role', 'Роль', 'Rol', 10),
      c('action', 'Действие', 'Harakat', 24),
      c('entity_type', 'Объект', 'Obyekt', 12),
      c('entity_id', 'ID объекта', 'Obyekt ID', 12),
      c('result', 'Результат', 'Natija', 10),
      c('ip', 'IP', 'IP', 16),
      c('metadata', 'Детали', 'Tafsilotlar', 50),
    ],
    rows: rows.map((r) => ({ ...r, date: fmtDate(r.created_at) })),
  });
});

/* ---------- Notifications ---------- */

notificationsRouter.use(requireAuth);

notificationsRouter.get('/', (req, res) => {
  const me = user(req);
  const items = all('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 100', me.id);
  const unread = get<{ c: number }>('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL', me.id)!.c;
  res.json({ items, unread });
});

notificationsRouter.post('/:id/read', (req, res) => {
  run('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL', now(), int(req.params.id), user(req).id);
  res.json({ ok: true });
});

notificationsRouter.post('/read-all', (req, res) => {
  run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', now(), user(req).id);
  res.json({ ok: true });
});

/* ---------- System settings & academic periods ---------- */

adminRouter.use(requireAuth);

adminRouter.get('/settings', requireRole('admin', 'auditor'), (_req, res) => res.json(getSettings()));

/* ---------- Database backups (admin only: they contain password hashes) ---------- */

adminRouter.get('/backups', requireRole('admin'), (_req, res) => res.json(listBackups()));

adminRouter.post('/backups', requireRole('admin'), (req, res) => {
  const b = createBackup('manual');
  audit(req, 'backup.create', { entityType: 'backup', entityId: b.name, metadata: { size: b.size } });
  res.status(201).json(b);
});

adminRouter.get('/backups/:name', requireRole('admin'), (req, res) => {
  const file = backupFile(String(req.params.name));
  audit(req, 'backup.download', { entityType: 'backup', entityId: String(req.params.name) });
  res.download(file);
});

const settingsBody = z.object({
  platform_name: z.string().trim().min(1).max(60),
  registration_enabled: z.enum(['0', '1']),
  google_auth_enabled: z.enum(['0', '1']),
  default_language: z.enum(['ru', 'uz']),
  min_password_length: z.string().regex(/^\d+$/).refine((v) => +v >= 6 && +v <= 64),
  default_pass_score: z.string().regex(/^\d+$/).refine((v) => +v >= 0 && +v <= 100),
  session_days: z.string().regex(/^\d+$/).refine((v) => +v >= 1 && +v <= 90),
  show_rating: z.enum(['0', '1']),
});

adminRouter.put('/settings', requireRole('admin'), (req, res) => {
  const b = parse(settingsBody.partial(), req.body);
  const before = getSettings();
  const changed: Record<string, { from: string; to: string }> = {};
  tx(() => {
    for (const [k, v] of Object.entries(b)) {
      if (v === undefined || before[k] === v) continue;
      changed[k] = { from: before[k], to: v };
      run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', k, v);
    }
  });
  if (Object.keys(changed).length) audit(req, 'settings.update', { entityType: 'settings', metadata: changed });
  res.json(getSettings());
});

adminRouter.get('/periods', (_req, res) => res.json(all('SELECT * FROM academic_periods ORDER BY starts_on DESC')));

const periodBody = z
  .object({
    name: z.string().trim().min(1).max(80),
    startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    isCurrent: z.boolean().default(false),
  })
  .refine((p) => p.endsOn > p.startsOn, { message: 'ends_before_starts', path: ['endsOn'] });

adminRouter.post('/periods', requireRole('admin'), (req, res) => {
  const b = parse(periodBody, req.body);
  const id = tx(() => {
    if (b.isCurrent) run('UPDATE academic_periods SET is_current = 0');
    return run('INSERT INTO academic_periods (name, starts_on, ends_on, is_current) VALUES (?, ?, ?, ?)', b.name, b.startsOn, b.endsOn, b.isCurrent).id;
  });
  audit(req, 'period.create', { entityType: 'period', entityId: id, metadata: b });
  res.status(201).json({ id });
});

adminRouter.put('/periods/:id', requireRole('admin'), (req, res) => {
  const id = int(req.params.id);
  const b = parse(periodBody, req.body);
  tx(() => {
    if (b.isCurrent) run('UPDATE academic_periods SET is_current = 0');
    if (!run('UPDATE academic_periods SET name = ?, starts_on = ?, ends_on = ?, is_current = ? WHERE id = ?', b.name, b.startsOn, b.endsOn, b.isCurrent, id).changes) {
      throw notFound();
    }
  });
  audit(req, 'period.update', { entityType: 'period', entityId: id, metadata: b });
  res.json({ ok: true });
});

adminRouter.delete('/periods/:id', requireRole('admin'), (req, res) => {
  const id = int(req.params.id);
  run('DELETE FROM academic_periods WHERE id = ?', id);
  audit(req, 'period.delete', { entityType: 'period', entityId: id });
  res.json({ ok: true });
});

/* ---------- Global search (partial match, scoped by role) ---------- */

searchRouter.use(requireAuth);

searchRouter.get('/', (req, res) => {
  const me = user(req);
  const q = qstr(req.query.q);
  if (!q || q.length < 2) throw badRequest('query_too_short');
  const like = `%${q.toLowerCase()}%`;
  const result: Record<string, unknown[]> = { users: [], groups: [], subjects: [], tests: [] };

  if (me.role === 'student') {
    result.tests = all(
      `SELECT DISTINCT t.id, t.title, s.name AS subject_name FROM assignments asg JOIN tests t ON t.id = asg.test_id
       JOIN subjects s ON s.id = t.subject_id
       WHERE (asg.user_id = ? OR asg.group_id IN (SELECT group_id FROM group_students WHERE user_id = ?))
         AND t.status IN ('published','completed') AND LOWER(t.title) LIKE ? LIMIT 8`,
      me.id,
      me.id,
      like,
    );
    result.subjects = all('SELECT id, name FROM subjects WHERE LOWER(name) LIKE ? LIMIT 5', like);
    return res.json(result);
  }

  const nameMatch = "(LOWER(u.first_name || ' ' || u.last_name) LIKE ? OR LOWER(u.last_name || ' ' || u.first_name) LIKE ? OR LOWER(u.email) LIKE ? OR u.phone LIKE ?)";
  if (seesEverything(me)) {
    result.users = all(`SELECT u.id, u.first_name, u.last_name, u.role FROM users u WHERE ${nameMatch} LIMIT 8`, like, like, like, like);
    result.groups = all('SELECT id, name, academic_year FROM study_groups WHERE LOWER(name) LIKE ? LIMIT 5', like);
    result.tests = all('SELECT t.id, t.title, s.name AS subject_name FROM tests t JOIN subjects s ON s.id = t.subject_id WHERE LOWER(t.title) LIKE ? LIMIT 8', like);
  } else {
    result.users = all(`SELECT u.id, u.first_name, u.last_name, u.role FROM users u WHERE u.role = 'student' AND ${nameMatch} LIMIT 8`, like, like, like, like);
    result.groups = all('SELECT id, name, academic_year FROM study_groups WHERE LOWER(name) LIKE ? LIMIT 5', like);
    result.tests = all(
      'SELECT t.id, t.title, s.name AS subject_name FROM tests t JOIN subjects s ON s.id = t.subject_id WHERE t.teacher_id = ? AND LOWER(t.title) LIKE ? LIMIT 8',
      me.id,
      like,
    );
  }
  result.subjects = all('SELECT id, name FROM subjects WHERE LOWER(name) LIKE ? LIMIT 5', like);
  res.json(result);
});

