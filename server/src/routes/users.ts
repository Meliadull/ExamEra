import { Router } from 'express';
import { z } from 'zod';
import { all, get, inList, now, run, tx, Where } from '../db.js';
import { badRequest, conflict, forbidden, int, notFound, paging, parse, qstr, requireAuth, requireRole, user } from '../http.js';
import { canViewStudent, seesEverything } from '../services/access.js';
import { actorOf, audit } from '../services/audit.js';
import { generateTempPassword, hashPassword, loadAuthUser, normalizePhone, revokeUserSessions } from '../services/auth.js';
import { notifyAdmins } from '../services/notify.js';
import { saveImage } from '../services/uploads.js';
import { ROLES, type Role } from '../types.js';

export const usersRouter = Router();
export const profileRouter = Router();

const PUBLIC_FIELDS = `u.id, u.first_name, u.last_name, u.phone, u.email, u.role, u.status, u.avatar_url,
  u.created_at, u.last_login_at, (u.google_id IS NOT NULL) AS has_google, u.requested_role`;

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

function addSearch(w: Where, search: string | undefined) {
  if (!search) return;
  const like = `%${search.toLowerCase()}%`;
  // Match phone numbers only when the query has enough digits ("9-А" should not match every phone).
  const raw = search.replace(/\D/g, '');
  const digits = raw.length >= 3 ? raw : '';
  w.add(
    "(LOWER(u.first_name || ' ' || u.last_name) LIKE ? OR LOWER(u.last_name || ' ' || u.first_name) LIKE ? OR LOWER(u.email) LIKE ? OR (? != '' AND u.phone LIKE ?))",
    like,
    like,
    like,
    digits,
    `%${digits}%`,
  );
}

const USER_SORT: Record<string, string> = {
  name: 'u.last_name, u.first_name',
  registered: 'u.created_at DESC',
  login: 'u.last_login_at IS NULL, u.last_login_at DESC',
};

usersRouter.get('/', (req, res) => {
  const me = user(req);
  const q = req.query as Record<string, string>;
  const w = new Where();
  if (me.role === 'student') throw forbidden();
  if (me.role === 'teacher') {
    // Teachers may find any student (to assign tests); statistics below stay limited.
    w.add("u.role = 'student'");
  }
  addSearch(w, qstr(q.search));
  if (q.role && ROLES.includes(q.role as Role)) w.add('u.role = ?', q.role);
  // Account filters (Users section): how the person signs in
  if (q.method === 'google') w.add('u.google_id IS NOT NULL');
  if (q.method === 'phone') w.add('u.google_id IS NULL');
  if (q.status) w.add('u.status = ?', q.status);
  if (q.groupId) w.add('u.id IN (SELECT user_id FROM group_students WHERE group_id = ?)', int(q.groupId));
  if (q.requested === 'teacher') w.add("u.requested_role = 'teacher' AND u.role = 'student'");
  const { page, pageSize, offset } = paging(q, 25);
  const total = get<{ c: number }>(`SELECT COUNT(*) AS c FROM users u ${w.sql}`, ...w.params)!.c;
  // For teachers: full numbers for students of the groups they lead, otherwise only their own tests.
  const tid = me.role === 'teacher' ? me.id : null;
  const statScope = `(? IS NULL OR t.teacher_id = ? OR EXISTS (SELECT 1 FROM group_students gs JOIN group_teachers gt ON gt.group_id = gs.group_id
      WHERE gs.user_id = u.id AND gt.user_id = ?))`;
  const rows = all<any>(
    `SELECT ${PUBLIC_FIELDS},
       (SELECT ROUND(AVG(a.percentage), 1) FROM attempts a JOIN tests t ON t.id = a.test_id
          WHERE a.user_id = u.id AND a.status = 'completed' AND ${statScope}) AS avg_percentage,
       (SELECT COUNT(*) FROM attempts a JOIN tests t ON t.id = a.test_id
          WHERE a.user_id = u.id AND a.status = 'completed' AND ${statScope}) AS attempts_count
     FROM users u ${w.sql} ORDER BY ${USER_SORT[q.sort] ?? "(u.requested_role IS NOT NULL AND u.role = 'student') DESC, u.last_name, u.first_name"} LIMIT ? OFFSET ?`,
    tid,
    tid,
    tid,
    tid,
    tid,
    tid,
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

// Accounts are created only by self-registration (phone or Google); administrators assign roles and duties.

const UNASSIGNED_SQL = `((u.role = 'teacher' AND (NOT EXISTS (SELECT 1 FROM subject_teachers st WHERE st.user_id = u.id)
      OR NOT EXISTS (SELECT 1 FROM group_teachers gt WHERE gt.user_id = u.id)))
  OR (u.role = 'student' AND NOT EXISTS (SELECT 1 FROM group_students gs WHERE gs.user_id = u.id)))`;

/** Roles section: role, pending teacher request and duties (subjects taught, groups) of every active account. */
usersRouter.get('/duties', requireRole('admin', 'auditor'), (req, res) => {
  const q = req.query as Record<string, string>;
  const w = new Where().add("u.status != 'archived'");
  addSearch(w, qstr(q.search));
  if (q.role === 'requests') w.add("u.requested_role = 'teacher' AND u.role = 'student'");
  else if (q.role && ROLES.includes(q.role as Role)) w.add('u.role = ?', q.role);
  if (q.subjectId) w.add('u.id IN (SELECT user_id FROM subject_teachers WHERE subject_id = ?)', int(q.subjectId));
  if (q.groupId) {
    const g = int(q.groupId);
    w.add('(u.id IN (SELECT user_id FROM group_teachers WHERE group_id = ?) OR u.id IN (SELECT user_id FROM group_students WHERE group_id = ?))', g, g);
  }
  if (q.unassigned === '1') w.add(UNASSIGNED_SQL);
  const { page, pageSize, offset } = paging(q, 25);
  const total = get<{ c: number }>(`SELECT COUNT(*) AS c FROM users u ${w.sql}`, ...w.params)!.c;
  const rows = all<any>(
    `SELECT u.id, u.first_name, u.last_name, u.phone, u.email, u.role, u.status, u.avatar_url, u.requested_role,
       ${UNASSIGNED_SQL} AS unassigned
     FROM users u ${w.sql}
     ORDER BY (u.requested_role = 'teacher' AND u.role = 'student') DESC,
       CASE u.role WHEN 'teacher' THEN 0 WHEN 'admin' THEN 1 WHEN 'auditor' THEN 2 ELSE 3 END, u.last_name, u.first_name
     LIMIT ? OFFSET ?`,
    ...w.params,
    pageSize,
    offset,
  );
  const ids = rows.map((r) => r.id);
  const subjects = all<{ user_id: number; id: number; name: string }>(
    `SELECT st.user_id, s.id, s.name FROM subject_teachers st JOIN subjects s ON s.id = st.subject_id
     WHERE st.user_id IN (${inList(ids)}) ORDER BY s.name`,
    ...ids,
  );
  const groups = all<{ user_id: number; id: number; name: string; relation: string }>(
    `SELECT gt.user_id, g.id, g.name, 'teacher' AS relation FROM group_teachers gt JOIN study_groups g ON g.id = gt.group_id WHERE gt.user_id IN (${inList(ids)})
     UNION ALL
     SELECT gs.user_id, g.id, g.name, 'student' FROM group_students gs JOIN study_groups g ON g.id = gs.group_id WHERE gs.user_id IN (${inList(ids)})
     ORDER BY 3`,
    ...ids,
    ...ids,
  );
  const counts = get<any>(
    `SELECT SUM(u.role = 'student') AS student, SUM(u.role = 'teacher') AS teacher, SUM(u.role = 'admin') AS admin,
       SUM(u.role = 'auditor') AS auditor, SUM(u.requested_role = 'teacher' AND u.role = 'student') AS requests,
       SUM(${UNASSIGNED_SQL}) AS unassigned
     FROM users u WHERE u.status != 'archived'`,
  );
  res.json({
    total,
    page,
    pageSize,
    counts,
    items: rows.map((r) => ({
      ...r,
      unassigned: !!r.unassigned,
      subjects: subjects.filter((x) => x.user_id === r.id).map(({ id, name }) => ({ id, name })),
      groups: groups.filter((x) => x.user_id === r.id).map(({ id, name, relation }) => ({ id, name, relation })),
    })),
  });
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
  const subjects = u.role === 'teacher' ? teacherSubjects(id) : [];
  res.json({ ...u, groups, subjects });
});

function teacherSubjects(userId: number) {
  return all<{ id: number; name: string }>(
    'SELECT s.id, s.name FROM subject_teachers st JOIN subjects s ON s.id = st.subject_id WHERE st.user_id = ? ORDER BY s.name',
    userId,
  );
}

/** Administrator assigns which subjects a teacher teaches and which groups they lead. */
usersRouter.put('/:id/teaching', requireRole('admin'), (req, res) => {
  const id = int(req.params.id);
  const b = parse(
    z.object({ subjectIds: z.array(z.number().int()).max(100), groupIds: z.array(z.number().int()).max(100) }),
    req.body,
  );
  const u = get<{ role: string }>('SELECT role FROM users WHERE id = ?', id);
  if (!u) throw notFound();
  if (u.role !== 'teacher') throw badRequest('not_a_teacher');
  const before = {
    subjectIds: teacherSubjects(id).map((s) => s.id),
    groupIds: all<{ group_id: number }>('SELECT group_id FROM group_teachers WHERE user_id = ?', id).map((r) => r.group_id),
  };
  tx(() => {
    run('DELETE FROM subject_teachers WHERE user_id = ?', id);
    run('DELETE FROM group_teachers WHERE user_id = ?', id);
    for (const sid of b.subjectIds) {
      if (get('SELECT 1 FROM subjects WHERE id = ?', sid)) run('INSERT OR IGNORE INTO subject_teachers (subject_id, user_id) VALUES (?, ?)', sid, id);
    }
    for (const gid of b.groupIds) {
      if (get('SELECT 1 FROM study_groups WHERE id = ?', gid)) run('INSERT OR IGNORE INTO group_teachers (group_id, user_id) VALUES (?, ?)', gid, id);
    }
  });
  audit(req, 'user.teaching_update', { entityType: 'user', entityId: id, metadata: { before, after: b } });
  res.json({ ok: true });
});

/** Administrator sets which groups a student belongs to. */
usersRouter.put('/:id/groups', requireRole('admin'), (req, res) => {
  const id = int(req.params.id);
  const { groupIds } = parse(z.object({ groupIds: z.array(z.number().int()).max(50) }), req.body);
  const u = get<{ role: string }>('SELECT role FROM users WHERE id = ?', id);
  if (!u) throw notFound();
  if (u.role !== 'student') throw badRequest('not_a_student');
  const before = all<{ group_id: number }>('SELECT group_id FROM group_students WHERE user_id = ?', id).map((r) => r.group_id);
  tx(() => {
    run('DELETE FROM group_students WHERE user_id = ?', id);
    for (const gid of groupIds) {
      if (get('SELECT 1 FROM study_groups WHERE id = ?', gid)) run('INSERT OR IGNORE INTO group_students (group_id, user_id) VALUES (?, ?)', gid, id);
    }
  });
  audit(req, 'user.groups_update', { entityType: 'user', entityId: id, metadata: { before, after: groupIds } });
  res.json({ ok: true });
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
  // Granting a role closes any pending self-registration request.
  run('UPDATE users SET role = ?, requested_role = NULL, updated_at = ? WHERE id = ?', role, now(), id);
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
  res.json({ ...u, groups, subjects: me.role === 'teacher' ? teacherSubjects(me.id) : [] });
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

/** A self-registered user asks to be a teacher (e.g. after signing up with Google). */
profileRouter.post('/teacher-request', (req, res) => {
  const me = user(req);
  if (me.role !== 'student') throw badRequest('already_has_role');
  if (me.requested_role !== 'teacher') {
    run("UPDATE users SET requested_role = 'teacher', updated_at = ? WHERE id = ?", now(), me.id);
    audit(req, 'user.teacher_request', { entityType: 'user', entityId: me.id });
    notifyAdmins('teacher_request', { name: `${me.first_name} ${me.last_name}` }, `/app/roles?user=${me.id}`);
  }
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
