import { Router } from 'express';
import { z } from 'zod';
import { all, get, inList, now, run, tx, Where } from '../db.js';
import { badRequest, conflict, forbidden, int, notFound, parse, requireAuth, user } from '../http.js';
import { assertCanEditTest, canManageGroup, canViewStudent, loadTest, seesEverything } from '../services/access.js';
import { audit } from '../services/audit.js';
import { assignmentStudentIds, type AssignmentRow } from '../services/attempts.js';
import { notify } from '../services/notify.js';

export const assignmentsRouter = Router();
assignmentsRouter.use(requireAuth);

const ASSIGNMENT_SELECT = `
  SELECT asg.*, t.title AS test_title, t.status AS test_status, s.name AS subject_name, t.teacher_id,
    g.name AS group_name, u.first_name || ' ' || u.last_name AS student_name,
    (SELECT COUNT(*) FROM questions q WHERE q.test_id = t.id) AS question_count,
    CASE WHEN asg.group_id IS NOT NULL
      THEN (SELECT COUNT(*) FROM group_students gs WHERE gs.group_id = asg.group_id) ELSE 1 END AS student_count,
    (SELECT COUNT(DISTINCT a.user_id) FROM attempts a WHERE a.assignment_id = asg.id AND a.status = 'completed') AS completed_count,
    (SELECT ROUND(AVG(a.percentage), 1) FROM attempts a WHERE a.assignment_id = asg.id AND a.status = 'completed') AS avg_percentage
  FROM assignments asg
  JOIN tests t ON t.id = asg.test_id
  JOIN subjects s ON s.id = t.subject_id
  LEFT JOIN study_groups g ON g.id = asg.group_id
  LEFT JOIN users u ON u.id = asg.user_id`;

assignmentsRouter.get('/', (req, res) => {
  const me = user(req);
  if (me.role === 'student') throw forbidden();
  const q = req.query as Record<string, string>;
  const w = new Where();
  if (!seesEverything(me)) w.add('t.teacher_id = ?', me.id);
  if (q.testId) w.add('asg.test_id = ?', int(q.testId));
  if (q.groupId) w.add('asg.group_id = ?', int(q.groupId));
  if (q.subjectId) w.add('t.subject_id = ?', int(q.subjectId));
  if (q.teacherId && seesEverything(me)) w.add('t.teacher_id = ?', int(q.teacherId));
  if (q.search) {
    const like = `%${String(q.search).toLowerCase()}%`;
    w.add(
      "(LOWER(t.title) LIKE ? OR LOWER(COALESCE(g.name, '')) LIKE ? OR LOWER(COALESCE(u.first_name || ' ' || u.last_name, '')) LIKE ?)",
      like,
      like,
      like,
    );
  }
  const t = now();
  if (q.state === 'active') w.add('asg.starts_at <= ? AND asg.ends_at >= ?', t, t);
  if (q.state === 'upcoming') w.add('asg.starts_at > ?', t);
  if (q.state === 'finished') w.add('asg.ends_at < ?', t);
  res.json(all(`${ASSIGNMENT_SELECT} ${w.sql} ORDER BY asg.starts_at DESC LIMIT 500`, ...w.params));
});

const body = z
  .object({
    testId: z.number().int().positive(),
    groupIds: z.array(z.number().int()).max(50).default([]),
    userIds: z.array(z.number().int()).max(500).default([]),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    durationMin: z.number().int().min(1).max(600).nullable().optional(),
    attemptsLimit: z.number().int().min(1).max(20),
    passScore: z.number().int().min(0).max(100),
    showResult: z.boolean(),
    showAnswers: z.boolean(),
  })
  .refine((b) => Date.parse(b.endsAt) > Date.parse(b.startsAt), { message: 'ends_before_starts', path: ['endsAt'] });

assignmentsRouter.post('/', (req, res) => {
  const me = user(req);
  const b = parse(body, req.body);
  const test = loadTest(b.testId);
  assertCanEditTest(me, test);
  if (test.status !== 'published') throw conflict('test_not_published');
  if (!b.groupIds.length && !b.userIds.length) throw badRequest('no_targets');
  for (const gid of b.groupIds) if (!canManageGroup(me, gid)) throw forbidden('group_forbidden');
  // The same test must not be handed to a group (or student) twice while an earlier assignment is still open.
  const dupGroups = all<{ name: string }>(
    `SELECT DISTINCT g.name FROM assignments asg JOIN study_groups g ON g.id = asg.group_id
     WHERE asg.test_id = ? AND asg.ends_at >= ? AND asg.group_id IN (${inList(b.groupIds)})`,
    test.id,
    now(),
    ...b.groupIds,
  );
  const dupStudents = all<{ name: string }>(
    `SELECT DISTINCT u.last_name || ' ' || u.first_name AS name FROM assignments asg JOIN users u ON u.id = asg.user_id
     WHERE asg.test_id = ? AND asg.ends_at >= ? AND asg.user_id IN (${inList(b.userIds)})`,
    test.id,
    now(),
    ...b.userIds,
  );
  if (dupGroups.length || dupStudents.length) {
    throw conflict('already_assigned', { names: [...dupGroups, ...dupStudents].map((r) => r.name).join(', ') });
  }
  const students = all<{ id: number }>(
    `SELECT id FROM users WHERE role = 'student' AND id IN (${inList(b.userIds)})`,
    ...b.userIds,
  ).map((r) => r.id);
  if (students.length !== b.userIds.length) throw badRequest('invalid_students');
  for (const sid of students) if (!canViewStudent(me, sid)) throw forbidden('student_forbidden');

  const t = now();
  const startsAt = new Date(b.startsAt).toISOString();
  const endsAt = new Date(b.endsAt).toISOString();
  const targets = [...b.groupIds.map((g) => ({ group_id: g, user_id: null })), ...students.map((u) => ({ group_id: null, user_id: u }))];
  const ids = tx(() =>
    targets.map(
      (tg) =>
        run(
          `INSERT INTO assignments (test_id, group_id, user_id, starts_at, ends_at, duration_min, attempts_limit, pass_score,
             show_result, show_answers, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          test.id,
          tg.group_id,
          tg.user_id,
          startsAt,
          endsAt,
          b.durationMin ?? null,
          b.attemptsLimit,
          b.passScore,
          b.showResult,
          b.showAnswers,
          me.id,
          t,
        ).id,
    ),
  );
  const subject = get<{ name: string }>('SELECT name FROM subjects WHERE id = ?', test.subject_id)!;
  const notified = new Set<number>();
  for (const tg of targets) {
    for (const uid of assignmentStudentIds(tg)) {
      if (notified.has(uid)) continue;
      notified.add(uid);
      notify(uid, 'test_assigned', { test: test.title, subject: subject.name, startsAt, endsAt }, '/app/my-tests');
    }
  }
  audit(req, 'assignment.create', {
    entityType: 'test',
    entityId: test.id,
    metadata: { assignmentIds: ids, groupIds: b.groupIds, userIds: students, startsAt, endsAt },
  });
  res.status(201).json({ ids, notified: notified.size });
});

function loadAssignment(id: number) {
  const a = get<AssignmentRow>('SELECT * FROM assignments WHERE id = ?', id);
  if (!a) throw notFound();
  return a;
}

assignmentsRouter.patch('/:id', (req, res) => {
  const me = user(req);
  const a = loadAssignment(int(req.params.id));
  assertCanEditTest(me, loadTest(a.test_id));
  const b = parse(
    z
      .object({
        startsAt: z.string().datetime({ offset: true }),
        endsAt: z.string().datetime({ offset: true }),
        durationMin: z.number().int().min(1).max(600).nullable().optional(),
        attemptsLimit: z.number().int().min(1).max(20),
        passScore: z.number().int().min(0).max(100),
        showResult: z.boolean(),
        showAnswers: z.boolean(),
      })
      .refine((v) => Date.parse(v.endsAt) > Date.parse(v.startsAt), { message: 'ends_before_starts', path: ['endsAt'] }),
    req.body,
  );
  run(
    `UPDATE assignments SET starts_at = ?, ends_at = ?, duration_min = ?, attempts_limit = ?, pass_score = ?,
       show_result = ?, show_answers = ?, reminded_at = CASE WHEN ends_at != ? THEN NULL ELSE reminded_at END WHERE id = ?`,
    new Date(b.startsAt).toISOString(),
    new Date(b.endsAt).toISOString(),
    b.durationMin ?? null,
    b.attemptsLimit,
    b.passScore,
    b.showResult,
    b.showAnswers,
    new Date(b.endsAt).toISOString(),
    a.id,
  );
  audit(req, 'assignment.update', { entityType: 'assignment', entityId: a.id, metadata: b });
  res.json({ ok: true });
});

assignmentsRouter.delete('/:id', (req, res) => {
  const me = user(req);
  const a = loadAssignment(int(req.params.id));
  assertCanEditTest(me, loadTest(a.test_id));
  if (get('SELECT 1 FROM attempts WHERE assignment_id = ?', a.id)) throw conflict('assignment_has_attempts');
  run('DELETE FROM assignments WHERE id = ?', a.id);
  audit(req, 'assignment.delete', { entityType: 'assignment', entityId: a.id, metadata: { testId: a.test_id } });
  res.json({ ok: true });
});
