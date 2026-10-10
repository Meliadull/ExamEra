import { Router } from 'express';
import { z } from 'zod';
import { all, get, inList, now, run, tx, Where } from '../db.js';
import { badRequest, conflict, forbidden, int, notFound, parse, qstr, requireAuth, requireRole, user } from '../http.js';
import { canViewGroup, leadsGroup } from '../services/access.js';
import { audit } from '../services/audit.js';

export const groupsRouter = Router();
export const subjectsRouter = Router();

groupsRouter.use(requireAuth);
subjectsRouter.use(requireAuth);

const groupBody = z.object({
  name: z.string().trim().min(1).max(80),
  academicYear: z.string().trim().min(4).max(20),
  status: z.enum(['active', 'archived']).default('active'),
});

groupsRouter.get('/', (req, res) => {
  const me = user(req);
  if (me.role === 'student') throw forbidden();
  const w = new Where();
  // Teachers see every group; averages count only their own tests unless they lead the group.
  const tid = me.role === 'teacher' ? me.id : null;
  const search = qstr(req.query.search);
  if (search) w.add('LOWER(g.name) LIKE ?', `%${search.toLowerCase()}%`);
  if (req.query.status) w.add('g.status = ?', String(req.query.status));
  const rows = all<any>(
    `SELECT g.*,
       (SELECT COUNT(*) FROM group_students gs WHERE gs.group_id = g.id) AS student_count,
       (SELECT GROUP_CONCAT(u.first_name || ' ' || u.last_name, ', ') FROM group_teachers gt JOIN users u ON u.id = gt.user_id WHERE gt.group_id = g.id) AS teachers,
       (SELECT GROUP_CONCAT(s.name, ', ') FROM group_subjects gsu JOIN subjects s ON s.id = gsu.subject_id WHERE gsu.group_id = g.id) AS subjects,
       EXISTS (SELECT 1 FROM group_teachers gt WHERE gt.group_id = g.id AND gt.user_id = ?) AS is_leader,
       (SELECT ROUND(AVG(a.percentage), 1) FROM attempts a JOIN tests t ON t.id = a.test_id WHERE a.status = 'completed'
          AND a.user_id IN (SELECT user_id FROM group_students WHERE group_id = g.id)
          AND (? IS NULL OR t.teacher_id = ? OR EXISTS (SELECT 1 FROM group_teachers gt WHERE gt.group_id = g.id AND gt.user_id = ?))) AS avg_percentage
     FROM study_groups g ${w.sql} ORDER BY is_leader DESC, g.status, g.name`,
    tid,
    tid,
    tid,
    tid,
    ...w.params,
  );
  res.json(rows);
});

groupsRouter.post('/', requireRole('admin'), (req, res) => {
  const b = parse(groupBody, req.body);
  const { id } = run(
    'INSERT INTO study_groups (name, academic_year, status, created_at) VALUES (?, ?, ?, ?)',
    b.name,
    b.academicYear,
    b.status,
    now(),
  );
  audit(req, 'group.create', { entityType: 'group', entityId: id, metadata: { name: b.name } });
  res.status(201).json({ id });
});

groupsRouter.get('/:id', (req, res) => {
  const me = user(req);
  const id = int(req.params.id);
  if (!canViewGroup(me, id)) throw forbidden();
  const g = get<any>('SELECT * FROM study_groups WHERE id = ?', id);
  if (!g) throw notFound();
  const isLeader = leadsGroup(me, id);
  // Not the class leader: per-student numbers cover only this teacher's own tests.
  const own = me.role === 'teacher' && !isLeader ? me.id : null;
  const students = all(
    `SELECT u.id, u.first_name, u.last_name, u.phone, u.email, u.status, u.avatar_url,
       (SELECT ROUND(AVG(a.percentage), 1) FROM attempts a JOIN tests t ON t.id = a.test_id
          WHERE a.user_id = u.id AND a.status = 'completed' AND (? IS NULL OR t.teacher_id = ?)) AS avg_percentage,
       (SELECT COUNT(*) FROM attempts a JOIN tests t ON t.id = a.test_id
          WHERE a.user_id = u.id AND a.status = 'completed' AND (? IS NULL OR t.teacher_id = ?)) AS attempts_count
     FROM group_students gs JOIN users u ON u.id = gs.user_id WHERE gs.group_id = ? ORDER BY u.last_name, u.first_name`,
    own,
    own,
    own,
    own,
    id,
  );
  const teachers = all(
    'SELECT u.id, u.first_name, u.last_name, u.email, u.phone FROM group_teachers gt JOIN users u ON u.id = gt.user_id WHERE gt.group_id = ?',
    id,
  );
  const subjects = all('SELECT s.id, s.name FROM group_subjects gs JOIN subjects s ON s.id = gs.subject_id WHERE gs.group_id = ?', id);
  // Group composition and teacher/subject links are managed by administrators only.
  res.json({ ...g, students, teachers, subjects, isLeader, scope: me.role === 'teacher' && !isLeader ? 'own' : 'full', canManage: me.role === 'admin' });
});

groupsRouter.patch('/:id', requireRole('admin'), (req, res) => {
  const id = int(req.params.id);
  const b = parse(groupBody, req.body);
  const r = run('UPDATE study_groups SET name = ?, academic_year = ?, status = ? WHERE id = ?', b.name, b.academicYear, b.status, id);
  if (!r.changes) throw notFound();
  audit(req, 'group.update', { entityType: 'group', entityId: id, metadata: b });
  res.json({ ok: true });
});

groupsRouter.post('/:id/students', requireRole('admin'), (req, res) => {
  const id = int(req.params.id);
  const { userIds } = parse(z.object({ userIds: z.array(z.number().int()).min(1).max(500) }), req.body);
  const valid = all<{ id: number }>(
    `SELECT id FROM users WHERE role = 'student' AND id IN (${inList(userIds)})`,
    ...userIds,
  ).map((r) => r.id);
  if (!valid.length) throw badRequest('no_valid_students');
  tx(() => valid.forEach((uid) => run('INSERT OR IGNORE INTO group_students (group_id, user_id) VALUES (?, ?)', id, uid)));
  audit(req, 'group.students_add', { entityType: 'group', entityId: id, metadata: { userIds: valid } });
  res.json({ added: valid.length });
});

groupsRouter.delete('/:id/students/:userId', requireRole('admin'), (req, res) => {
  const id = int(req.params.id);
  const uid = int(req.params.userId);
  run('DELETE FROM group_students WHERE group_id = ? AND user_id = ?', id, uid);
  audit(req, 'group.student_remove', { entityType: 'group', entityId: id, metadata: { userId: uid } });
  res.json({ ok: true });
});

groupsRouter.put('/:id/teachers', requireRole('admin'), (req, res) => {
  const id = int(req.params.id);
  const { userIds } = parse(z.object({ userIds: z.array(z.number().int()).max(50) }), req.body);
  tx(() => {
    run('DELETE FROM group_teachers WHERE group_id = ?', id);
    for (const uid of userIds) {
      if (get("SELECT 1 FROM users WHERE id = ? AND role = 'teacher'", uid)) {
        run('INSERT INTO group_teachers (group_id, user_id) VALUES (?, ?)', id, uid);
      }
    }
  });
  audit(req, 'group.teachers_set', { entityType: 'group', entityId: id, metadata: { userIds } });
  res.json({ ok: true });
});

groupsRouter.put('/:id/subjects', requireRole('admin'), (req, res) => {
  const id = int(req.params.id);
  const { subjectIds } = parse(z.object({ subjectIds: z.array(z.number().int()).max(50) }), req.body);
  tx(() => {
    run('DELETE FROM group_subjects WHERE group_id = ?', id);
    for (const sid of subjectIds) run('INSERT OR IGNORE INTO group_subjects (group_id, subject_id) VALUES (?, ?)', id, sid);
  });
  audit(req, 'group.subjects_set', { entityType: 'group', entityId: id, metadata: { subjectIds } });
  res.json({ ok: true });
});

/* ---------- Subjects ---------- */

const subjectBody = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(1000).default(''),
  topics: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
});

subjectsRouter.get('/', (req, res) => {
  const me = user(req);
  // ?mine=1 — only subjects assigned to the current teacher by an administrator
  const mine = req.query.mine === '1' && me.role === 'teacher';
  const rows = all<any>(
    `SELECT s.*,
       (SELECT COUNT(*) FROM tests t WHERE t.subject_id = s.id AND t.status != 'archived') AS test_count,
       (SELECT GROUP_CONCAT(u.first_name || ' ' || u.last_name, ', ') FROM subject_teachers st JOIN users u ON u.id = st.user_id WHERE st.subject_id = s.id) AS teachers,
       (SELECT GROUP_CONCAT(g.name, ', ') FROM group_subjects gs JOIN study_groups g ON g.id = gs.group_id WHERE gs.subject_id = s.id) AS groups,
       (SELECT ROUND(AVG(a.percentage), 1) FROM attempts a JOIN tests t ON t.id = a.test_id WHERE t.subject_id = s.id AND a.status = 'completed') AS avg_percentage
     FROM subjects s ${mine ? 'WHERE s.id IN (SELECT subject_id FROM subject_teachers WHERE user_id = ?)' : ''} ORDER BY s.name`,
    ...(mine ? [me.id] : []),
  );
  res.json(rows.map((r) => ({ ...r, topics: JSON.parse(r.topics) })));
});

subjectsRouter.post('/', requireRole('admin'), (req, res) => {
  const b = parse(subjectBody, req.body);
  if (get('SELECT 1 FROM subjects WHERE LOWER(name) = LOWER(?)', b.name)) throw conflict('subject_exists');
  const { id } = run(
    'INSERT INTO subjects (name, description, topics, created_at) VALUES (?, ?, ?, ?)',
    b.name,
    b.description,
    JSON.stringify(b.topics),
    now(),
  );
  audit(req, 'subject.create', { entityType: 'subject', entityId: id, metadata: { name: b.name } });
  res.status(201).json({ id });
});

subjectsRouter.patch('/:id', requireRole('admin'), (req, res) => {
  const id = int(req.params.id);
  const b = parse(subjectBody, req.body);
  const r = run('UPDATE subjects SET name = ?, description = ?, topics = ? WHERE id = ?', b.name, b.description, JSON.stringify(b.topics), id);
  if (!r.changes) throw notFound();
  audit(req, 'subject.update', { entityType: 'subject', entityId: id, metadata: { name: b.name } });
  res.json({ ok: true });
});

subjectsRouter.put('/:id/teachers', requireRole('admin'), (req, res) => {
  const id = int(req.params.id);
  const { userIds } = parse(z.object({ userIds: z.array(z.number().int()).max(50) }), req.body);
  tx(() => {
    run('DELETE FROM subject_teachers WHERE subject_id = ?', id);
    for (const uid of userIds) {
      if (get("SELECT 1 FROM users WHERE id = ? AND role = 'teacher'", uid)) {
        run('INSERT INTO subject_teachers (subject_id, user_id) VALUES (?, ?)', id, uid);
      }
    }
  });
  audit(req, 'subject.teachers_set', { entityType: 'subject', entityId: id, metadata: { userIds } });
  res.json({ ok: true });
});

subjectsRouter.delete('/:id', requireRole('admin'), (req, res) => {
  const id = int(req.params.id);
  if (get('SELECT 1 FROM tests WHERE subject_id = ?', id)) throw conflict('subject_has_tests');
  run('DELETE FROM subjects WHERE id = ?', id);
  audit(req, 'subject.delete', { entityType: 'subject', entityId: id });
  res.json({ ok: true });
});
