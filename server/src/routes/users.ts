import { Router } from 'express';
import { z } from 'zod';
import { all, get, inList, now, run, tx, Where } from '../db.js';
import { badRequest, conflict, forbidden, int, notFound, paging, parse, qstr, requireAuth, requireRole, user } from '../http.js';
import { canViewStudent, seesEverything, teacherGroupIds } from '../services/access.js';
import { actorOf, audit } from '../services/audit.js';
import { checkPasswordPolicy, generateTempPassword, hashPassword, loadAuthUser, normalizePhone, revokeUserSessions } from '../services/auth.js';
import { saveImage } from '../services/uploads.js';
import { ROLES, type Role } from '../types.js';

export const usersRouter = Router();
export const profileRouter = Router();

const PUBLIC_FIELDS = `u.id, u.first_name, u.last_name, u.phone, u.email, u.role, u.status, u.avatar_url,
  u.created_at, u.last_login_at, (u.google_id IS NOT NULL) AS has_google`;

const optPhone = z
  .string()
  .max(32)
  .optional()
  .nullable()
  .transform((v, ctx) => {
    if (!v) return null;
    const p = normalizePhone(v);
    if (!p) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid_phone' });
      return z.NEVER;
    }
    return p;
  });
const optEmail = z
  .union([z.literal(''), z.string().trim().toLowerCase().email().max(120)])
  .optional()
  .nullable()
  .transform((v) => v || null);

function groupsOf(userIds: number[]) {
  return all<{ user_id: number; id: number; name: string }>(
    `SELECT gs.user_id, g.id, g.name FROM group_students gs JOIN study_groups g ON g.id = gs.group_id
     WHERE gs.user_id IN (${inList(userIds)}) ORDER BY g.name`,
    ...userIds,
  );
}

usersRouter.use(requireAuth);

usersRouter.get('/', (req, res) => {
  const me = user(req);
  const q = req.query as Record<string, string>;
  const w = new Where();
  if (me.role === 'student') throw forbidden();
  if (me.role === 'teacher') {
    // Teachers see students only (their groups by default, everyone with scope=all to add to groups).
    w.add("u.role = 'student'");
    if (q.scope !== 'all') {
      const gids = teacherGroupIds(me.id);
      w.add(
        `(u.id IN (SELECT user_id FROM group_students WHERE group_id IN (${inList(gids)}))
          OR u.id IN (SELECT a.user_id FROM attempts a JOIN tests t ON t.id = a.test_id WHERE t.teacher_id = ?))`,
        ...gids,
        me.id,
      );
    }
  }
  const search = qstr(q.search);
  if (search) {
    const like = `%${search.toLowerCase()}%`;
    const digits = search.replace(/\D/g, '');
    w.add(
      "(LOWER(u.first_name || ' ' || u.last_name) LIKE ? OR LOWER(u.last_name || ' ' || u.first_name) LIKE ? OR LOWER(u.email) LIKE ? OR (? != '' AND u.phone LIKE ?))",
      like,
      like,
      like,
      digits,
      `%${digits}%`,
    );
  }
  if (q.role && ROLES.includes(q.role as Role)) w.add('u.role = ?', q.role);
  if (q.status) w.add('u.status = ?', q.status);
  if (q.groupId) w.add('u.id IN (SELECT user_id FROM group_students WHERE group_id = ?)', int(q.groupId));
  const { page, pageSize, offset } = paging(q, 25);
  const total = get<{ c: number }>(`SELECT COUNT(*) AS c FROM users u ${w.sql}`, ...w.params)!.c;
  const rows = all<any>(
    `SELECT ${PUBLIC_FIELDS},
       (SELECT ROUND(AVG(a.percentage), 1) FROM attempts a WHERE a.user_id = u.id AND a.status = 'completed') AS avg_percentage,
       (SELECT COUNT(*) FROM attempts a WHERE a.user_id = u.id AND a.status = 'completed') AS attempts_count
     FROM users u ${w.sql} ORDER BY u.last_name, u.first_name LIMIT ? OFFSET ?`,
    ...w.params,
    pageSize,
    offset,
  );
  const groups = groupsOf(rows.map((r) => r.id));
  res.json({
    total,
    page,
    pageSize,
    items: rows.map((r) => ({ ...r, groups: groups.filter((g) => g.user_id === r.id).map(({ id, name }) => ({ id, name })) })),
  });
});

usersRouter.post('/', requireRole('admin'), async (req, res) => {
  const b = parse(
    z.object({
      firstName: z.string().trim().min(1).max(60),
      lastName: z.string().trim().min(1).max(60),
      phone: optPhone,
      email: optEmail,
      role: z.enum(ROLES as [Role, ...Role[]]),
      password: z.string().max(128).optional(),
      groupIds: z.array(z.number().int()).optional(),
    }),
    req.body,
  );
  if (!b.phone && !b.email) throw badRequest('phone_or_email_required');
  let tempPassword: string | undefined;
  let password = b.password || '';
  if (password) checkPasswordPolicy(password);
  else password = tempPassword = generateTempPassword();
  const hash = await hashPassword(password);
  const t = now();
  const id = tx(() => {
    const { id } = run(
      `INSERT INTO users (first_name, last_name, phone, email, password_hash, role, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      b.firstName,
      b.lastName,
      b.phone,
      b.email,
      hash,
      b.role,
      t,
      t,
    );
    const table = b.role === 'teacher' ? 'group_teachers' : 'group_students';
    for (const gid of b.groupIds ?? []) run(`INSERT OR IGNORE INTO ${table} (group_id, user_id) VALUES (?, ?)`, gid, id);
    return id;
  });
  audit(req, 'user.create', { entityType: 'user', entityId: id, metadata: { role: b.role, name: `${b.firstName} ${b.lastName}` } });
  res.status(201).json({ id, tempPassword });
});

usersRouter.get('/:id', (req, res) => {
  const me = user(req);
  const id = int(req.params.id);
  if (!canViewStudent(me, id)) throw forbidden();
  const u = get<any>(`SELECT ${PUBLIC_FIELDS} FROM users u WHERE u.id = ?`, id);
  if (!u) throw notFound();
  if (me.role === 'teacher' && u.role !== 'student') throw forbidden();
  const groups = all(
    `SELECT g.id, g.name, g.academic_year, 'student' AS relation FROM group_students gs JOIN study_groups g ON g.id = gs.group_id WHERE gs.user_id = ?
     UNION ALL
     SELECT g.id, g.name, g.academic_year, 'teacher' FROM group_teachers gt JOIN study_groups g ON g.id = gt.group_id WHERE gt.user_id = ?`,
    id,
    id,
  );
  res.json({ ...u, groups });
});

usersRouter.patch('/:id', requireRole('admin'), (req, res) => {
  const id = int(req.params.id);
  const b = parse(
    z.object({
      firstName: z.string().trim().min(1).max(60),
      lastName: z.string().trim().min(1).max(60),
      phone: optPhone,
      email: optEmail,
    }),
    req.body,
  );
  const before = get<any>('SELECT first_name, last_name, phone, email FROM users WHERE id = ?', id);
  if (!before) throw notFound();
  if (!b.phone && !b.email) throw badRequest('phone_or_email_required');
  run(
    'UPDATE users SET first_name = ?, last_name = ?, phone = ?, email = ?, updated_at = ? WHERE id = ?',
    b.firstName,
    b.lastName,
    b.phone,
    b.email,
    now(),
    id,
  );
  const changed = Object.entries({ first_name: b.firstName, last_name: b.lastName, phone: b.phone, email: b.email })
    .filter(([k, v]) => before[k] !== v)
    .map(([k]) => k);
  audit(req, 'user.update', { entityType: 'user', entityId: id, metadata: { changed } });
  res.json({ ok: true });
});

usersRouter.patch('/:id/role', requireRole('admin'), (req, res) => {
  const id = int(req.params.id);
  const { role } = parse(z.object({ role: z.enum(ROLES as [Role, ...Role[]]) }), req.body);
  if (id === user(req).id) throw badRequest('cannot_change_own_role');
  const u = get<{ role: string }>('SELECT role FROM users WHERE id = ?', id);
  if (!u) throw notFound();
  run('UPDATE users SET role = ?, updated_at = ? WHERE id = ?', role, now(), id);
  revokeUserSessions(id);
  audit(req, 'user.role_change', { entityType: 'user', entityId: id, metadata: { from: u.role, to: role } });
  res.json({ ok: true });
});

usersRouter.patch('/:id/status', requireRole('admin'), (req, res) => {
  const id = int(req.params.id);
  const { status } = parse(z.object({ status: z.enum(['active', 'blocked', 'archived']) }), req.body);
  if (id === user(req).id) throw badRequest('cannot_change_own_status');
  const u = get<{ status: string }>('SELECT status FROM users WHERE id = ?', id);
  if (!u) throw notFound();
  run('UPDATE users SET status = ?, updated_at = ? WHERE id = ?', status, now(), id);
  if (status !== 'active') revokeUserSessions(id);
  const action = status === 'blocked' ? 'user.block' : status === 'archived' ? 'user.archive' : 'user.activate';
  audit(req, action, { entityType: 'user', entityId: id, metadata: { from: u.status, to: status } });
  res.json({ ok: true });
});

usersRouter.post('/:id/reset-password', requireRole('admin'), async (req, res) => {
  const id = int(req.params.id);
  if (!get('SELECT 1 FROM users WHERE id = ?', id)) throw notFound();
  const temp = generateTempPassword();
  run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', await hashPassword(temp), now(), id);
  revokeUserSessions(id);
  audit(req, 'user.reset_access', { entityType: 'user', entityId: id });
  res.json({ tempPassword: temp });
});

usersRouter.get('/:id/activity', (req, res) => {
  const me = user(req);
  const id = int(req.params.id);
  if (!seesEverything(me) && me.id !== id) throw forbidden();
  res.json(
    all(
      `SELECT id, event_id, action, entity_type, entity_id, result, ip, metadata, created_at FROM audit_log
       WHERE user_id = ? ORDER BY id DESC LIMIT 100`,
      id,
    ),
  );
});

/* ---------- Own profile ---------- */

profileRouter.use(requireAuth);

profileRouter.get('/', (req, res) => {
  const me = user(req);
  const u = get<any>(`SELECT ${PUBLIC_FIELDS}, u.language FROM users u WHERE u.id = ?`, me.id);
  const groups = all(
    `SELECT g.id, g.name, g.academic_year FROM study_groups g
     WHERE g.id IN (SELECT group_id FROM group_students WHERE user_id = ? UNION SELECT group_id FROM group_teachers WHERE user_id = ?)`,
    me.id,
    me.id,
  );
  res.json({ ...u, groups });
});

profileRouter.patch('/', (req, res) => {
  const me = user(req);
  const b = parse(
    z.object({
      firstName: z.string().trim().min(1).max(60),
      lastName: z.string().trim().min(1).max(60),
      email: optEmail,
      language: z.enum(['ru', 'uz']).optional(),
    }),
    req.body,
  );
  const before = get<any>('SELECT first_name, last_name, email, phone FROM users WHERE id = ?', me.id)!;
  if (!b.email && !before.phone) throw badRequest('phone_or_email_required');
  if (b.email && b.email !== before.email && get('SELECT 1 FROM users WHERE email = ? AND id != ?', b.email, me.id)) {
    throw conflict('email_taken');
  }
  run(
    'UPDATE users SET first_name = ?, last_name = ?, email = ?, language = COALESCE(?, language), updated_at = ? WHERE id = ?',
    b.firstName,
    b.lastName,
    b.email,
    b.language ?? null,
    now(),
    me.id,
  );
  const changed = Object.entries({ first_name: b.firstName, last_name: b.lastName, email: b.email })
    .filter(([k, v]) => before[k] !== v)
    .map(([k]) => k);
  if (changed.length) audit(req, 'profile.update', { entityType: 'user', entityId: me.id, metadata: { changed } });
  res.json({ user: loadAuthUser(me.id) });
});

profileRouter.post('/avatar', (req, res) => {
  const me = user(req);
  const { data } = parse(z.object({ data: z.string().min(20).max(4_000_000) }), req.body);
  const url = saveImage(data);
  run('UPDATE users SET avatar_url = ?, updated_at = ? WHERE id = ?', url, now(), me.id);
  audit(req, 'profile.avatar_update', { actor: actorOf(me), entityType: 'user', entityId: me.id });
  res.json({ avatarUrl: url });
});
