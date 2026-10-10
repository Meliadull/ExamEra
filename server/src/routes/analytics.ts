import { Router } from 'express';
import { all, get, getSetting, now, Where } from '../db.js';
import { forbidden, int, notFound, requireAuth, requireRole, user } from '../http.js';
import { assertCanViewTest, canViewGroup, canViewStudent, leadsGroup, leadsStudent, loadTest, seesEverything } from '../services/access.js';
import {
  ATTEMPT_FROM,
  attemptWhere,
  bySubject,
  byTopic,
  distribution,
  dynamics,
  hardQuestions,
  kpis,
  previousPeriod,
  readFilters,
} from '../services/analytics.js';
import { loadQuestions } from '../services/tests.js';

export const analyticsRouter = Router();
analyticsRouter.use(requireAuth);

const staffOnly = requireRole('teacher', 'admin', 'auditor');

analyticsRouter.get('/overview', staffOnly, (req, res) => {
  const me = user(req);
  const f = readFilters(req.query as Record<string, unknown>);
  const w = attemptWhere(me, f);
  const prevF = previousPeriod(f);
  const prev = prevF ? kpis(attemptWhere(me, prevF)) : null;
  const topics = byTopic(w);
  const prevTopics = prevF ? new Map(byTopic(attemptWhere(me, prevF)).map((t: any) => [`${t.topic}|${t.subject_name}`, t.value])) : new Map();
  res.json({
    kpis: kpis(w),
    previous: prev,
    dynamics: dynamics(w),
    bySubject: bySubject(w),
    distribution: distribution(w),
    hardTopics: topics
      .filter((t: any) => t.value < 70)
      .slice(0, 6)
      .map((t: any) => {
        const p = prevTopics.get(`${t.topic}|${t.subject_name}`);
        return { ...t, delta: p != null ? Math.round((t.value - p) * 10) / 10 : null };
      }),
    hardQuestions: hardQuestions(w),
  });
});

analyticsRouter.get('/dashboard', staffOnly, (req, res) => {
  const me = user(req);
  const f = readFilters(req.query as Record<string, unknown>);
  const w = attemptWhere(me, f);
  const tw = new Where();
  if (!seesEverything(me)) tw.add('t.teacher_id = ?', me.id);
  const t = now();
  const testCounts = get<any>(
    `SELECT SUM(t.status = 'published') AS active, SUM(t.status = 'draft') AS drafts, SUM(t.status = 'completed') AS completed, COUNT(*) AS total
     FROM tests t ${tw.sql}`,
    ...tw.params,
  );
  const students =
    me.role === 'teacher'
      ? get<{ c: number }>(
          `SELECT COUNT(DISTINCT gs.user_id) AS c FROM group_students gs JOIN group_teachers gt ON gt.group_id = gs.group_id WHERE gt.user_id = ?`,
          me.id,
        )!.c
      : get<{ c: number }>("SELECT COUNT(*) AS c FROM users WHERE role = 'student' AND status = 'active'")!.c;
  const allTime = kpis(attemptWhere(me, {}));
  const recentTests = all(
    `SELECT t.id, t.title, t.status, s.name AS subject_name,
       (SELECT COUNT(DISTINCT a.user_id) FROM attempts a WHERE a.test_id = t.id AND a.status = 'completed') AS participants,
       (SELECT ROUND(AVG(a.percentage), 1) FROM attempts a WHERE a.test_id = t.id AND a.status = 'completed') AS avg_percentage
     FROM tests t JOIN subjects s ON s.id = t.subject_id ${tw.sql} ${tw.parts.length ? 'AND' : 'WHERE'} t.status != 'archived'
     ORDER BY t.updated_at DESC LIMIT 5`,
    ...tw.params,
  );
  const upcoming = all(
    `SELECT asg.id, asg.starts_at, asg.ends_at, t.title, t.id AS test_id, s.name AS subject_name,
       COALESCE(g.name, u.first_name || ' ' || u.last_name) AS target
     FROM assignments asg JOIN tests t ON t.id = asg.test_id JOIN subjects s ON s.id = t.subject_id
     LEFT JOIN study_groups g ON g.id = asg.group_id LEFT JOIN users u ON u.id = asg.user_id
     ${tw.sql} ${tw.parts.length ? 'AND' : 'WHERE'} asg.ends_at >= ? ORDER BY asg.starts_at LIMIT 5`,
    ...tw.params,
    t,
  );
  res.json({
    counts: { activeTests: testCounts?.active ?? 0, drafts: testCounts?.drafts ?? 0, students, completedAttempts: allTime.attempts },
    avgPercentage: allTime.avg_percentage,
    dynamics: dynamics(w),
    distribution: distribution(w),
    recentTests,
    upcoming,
  });
});

analyticsRouter.get('/tests/:id', staffOnly, (req, res) => {
  const me = user(req);
  const test = loadTest(int(req.params.id));
  assertCanViewTest(me, test);
  const f = { ...readFilters(req.query as Record<string, unknown>), testId: test.id };
  const w = attemptWhere(me, f);
  const attempts = all<any>(
    `SELECT at.id, at.user_id, u.first_name, u.last_name, at.score, at.max_score, at.percentage, at.correct_count,
       at.wrong_count, at.skipped_count, at.duration_sec, at.completed_at, at.passed, at.finish_reason,
       COALESCE(g.name, (SELECT GROUP_CONCAT(g2.name, ', ') FROM group_students gs2 JOIN study_groups g2 ON g2.id = gs2.group_id WHERE gs2.user_id = at.user_id)) AS group_name
     ${ATTEMPT_FROM} ${w.sql} ORDER BY at.percentage DESC, at.completed_at`,
    ...w.params,
  );
  const assigned = get<{ c: number }>(
    `SELECT COUNT(DISTINCT uid) AS c FROM (
       SELECT asg.user_id AS uid FROM assignments asg WHERE asg.test_id = ? AND asg.user_id IS NOT NULL
       UNION SELECT gs.user_id FROM assignments asg JOIN group_students gs ON gs.group_id = asg.group_id WHERE asg.test_id = ?)`,
    test.id,
    test.id,
  )!.c;

  const questions = loadQuestions(test.id);
  const attemptIds = attempts.map((a) => a.id);
  const answers = attemptIds.length
    ? all<{ question_id: number; answer: string | null; is_correct: number | null }>(
        `SELECT sa.question_id, sa.answer, sa.is_correct FROM student_answers sa
         JOIN attempts at ON at.id = sa.attempt_id JOIN tests t ON t.id = at.test_id JOIN users u ON u.id = at.user_id
         JOIN assignments asg ON asg.id = at.assignment_id LEFT JOIN study_groups g ON g.id = asg.group_id ${w.sql}`,
        ...w.params,
      )
    : [];
  const total = attempts.length;
  const questionStats = questions.map((q) => {
    const qa = answers.filter((a) => a.question_id === q.id);
    const correct = qa.filter((a) => a.is_correct === 1).length;
    const wrong = qa.filter((a) => a.is_correct === 0).length;
    const skipped = total - correct - wrong;
    const optionCounts = q.options.map((o) => ({
      id: o.id,
      text: o.text,
      is_correct: !!o.is_correct,
      count: qa.filter((a) => {
        if (!a.answer) return false;
        const v = JSON.parse(a.answer);
        return Array.isArray(v) ? v.includes(o.id) : v === o.id;
      }).length,
    }));
    const pct = (n: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);
    return {
      id: q.id,
      position: q.position,
      type: q.type,
      text: q.text,
      score: q.score,
      correct,
      wrong,
      skipped,
      correct_pct: pct(correct),
      wrong_pct: pct(wrong),
      skipped_pct: pct(skipped),
      options: q.type === 'short_text' ? [] : optionCounts,
      text_answers:
        q.type === 'short_text'
          ? Object.entries(
              qa.reduce<Record<string, number>>((acc, a) => {
                if (a.answer) {
                  const v = String(JSON.parse(a.answer)).trim();
                  acc[v] = (acc[v] ?? 0) + 1;
                }
                return acc;
              }, {}),
            )
              .sort((a, b) => b[1] - a[1])
              .slice(0, 10)
              .map(([text, count]) => ({ text, count }))
          : [],
    };
  });
  const byGroup = all(
    `SELECT COALESCE(g.name, '—') AS name, ROUND(AVG(at.percentage), 1) AS value, COUNT(*) AS attempts
     ${ATTEMPT_FROM} ${w.sql} GROUP BY g.id ORDER BY value DESC`,
    ...w.params,
  );
  res.json({
    test: { id: test.id, title: test.title, status: test.status, topic: test.topic, subject_id: test.subject_id },
    kpis: { ...kpis(w), assigned, completed_students: new Set(attempts.map((a) => a.user_id)).size },
    distribution: distribution(w),
    attempts,
    questions: questionStats,
    byGroup,
  });
});

analyticsRouter.get('/groups/:id', staffOnly, (req, res) => {
  const me = user(req);
  const groupId = int(req.params.id);
  if (!canViewGroup(me, groupId)) throw forbidden();
  const group = get<any>('SELECT * FROM study_groups WHERE id = ?', groupId);
  if (!group) throw notFound();
  const f = { ...readFilters(req.query as Record<string, unknown>), groupId };
  const isLeader = leadsGroup(me, groupId);
  const full = seesEverything(me) || isLeader;
  const w = attemptWhere(me, f, { fullScope: full });
  const studentCount = get<{ c: number }>('SELECT COUNT(*) AS c FROM group_students WHERE group_id = ?', groupId)!.c;
  const showRating = getSetting('show_rating') === '1';
  const rating = all(
    `SELECT u.id, u.first_name, u.last_name, ROUND(AVG(at.percentage), 1) AS avg_percentage, COUNT(*) AS attempts,
       SUM(at.passed) AS passed
     ${ATTEMPT_FROM} ${w.sql} GROUP BY u.id ORDER BY avg_percentage DESC`,
    ...w.params,
  );
  const tests = all(
    `SELECT t.id, t.title, s.name AS subject_name, t.teacher_id,
       (SELECT tu.first_name || ' ' || tu.last_name FROM users tu WHERE tu.id = t.teacher_id) AS teacher_name,
       ROUND(AVG(at.percentage), 1) AS avg_percentage,
       COUNT(DISTINCT at.user_id) AS participants, SUM(at.passed) AS passed, COUNT(*) - SUM(at.passed) AS failed
     ${ATTEMPT_FROM} ${w.sql} GROUP BY t.id ORDER BY MAX(at.completed_at) DESC`,
    ...w.params,
  );
  res.json({
    group,
    scope: full ? 'full' : 'own',
    isLeader,
    studentCount,
    kpis: kpis(w),
    distribution: distribution(w),
    dynamics: dynamics(w),
    bySubject: bySubject(w),
    rating: showRating ? rating : null,
    tests,
    hardQuestions: hardQuestions(w, 6),
  });
});

/**
 * "My class" — the class leader's monitoring view of a group: every subject and teacher,
 * per-student standing (incl. missed/pending tests) and the state of all tests assigned to the class.
 */
analyticsRouter.get('/class/:id', staffOnly, (req, res) => {
  const me = user(req);
  const groupId = int(req.params.id);
  if (!seesEverything(me) && !leadsGroup(me, groupId)) throw forbidden('not_class_leader');
  const group = get<any>('SELECT id, name, academic_year, status FROM study_groups WHERE id = ?', groupId);
  if (!group) throw notFound();
  const t = now();
  const w = attemptWhere(me, { ...readFilters(req.query as Record<string, unknown>), groupId }, { fullScope: true });

  // Assignments that concern a student: to the whole class or to the student personally.
  const MINE = `(asg.group_id = ? OR asg.user_id = u.id) AND tt.status IN ('published', 'completed')`;
  const NOT_DONE = `NOT EXISTS (SELECT 1 FROM attempts a2 WHERE a2.assignment_id = asg.id AND a2.user_id = u.id AND a2.status = 'completed')`;
  const students = all<any>(
    `SELECT u.id, u.first_name, u.last_name, u.avatar_url, u.status,
       (SELECT ROUND(AVG(a.percentage), 1) FROM attempts a WHERE a.user_id = u.id AND a.status = 'completed') AS avg_percentage,
       (SELECT COUNT(*) FROM attempts a WHERE a.user_id = u.id AND a.status = 'completed') AS attempts,
       (SELECT COALESCE(SUM(a.passed), 0) FROM attempts a WHERE a.user_id = u.id AND a.status = 'completed') AS passed,
       (SELECT COUNT(*) - COALESCE(SUM(a.passed), 0) FROM attempts a WHERE a.user_id = u.id AND a.status = 'completed') AS failed,
       (SELECT MAX(a.completed_at) FROM attempts a WHERE a.user_id = u.id AND a.status = 'completed') AS last_completed_at,
       (SELECT COUNT(*) FROM assignments asg JOIN tests tt ON tt.id = asg.test_id
          WHERE ${MINE} AND asg.ends_at < ? AND ${NOT_DONE}) AS missed,
       (SELECT COUNT(*) FROM assignments asg JOIN tests tt ON tt.id = asg.test_id
          WHERE ${MINE} AND tt.status = 'published' AND asg.starts_at <= ? AND asg.ends_at >= ? AND ${NOT_DONE}) AS pending
     FROM group_students gs JOIN users u ON u.id = gs.user_id
     WHERE gs.group_id = ? ORDER BY u.last_name, u.first_name`,
    groupId,
    t,
    groupId,
    t,
    t,
    groupId,
  );
  const assignments = all<any>(
    `SELECT asg.id, asg.test_id, asg.starts_at, asg.ends_at, tt.title, tt.status AS test_status, s.name AS subject_name,
       tt.teacher_id, (SELECT tu.first_name || ' ' || tu.last_name FROM users tu WHERE tu.id = tt.teacher_id) AS teacher_name,
       (SELECT COUNT(*) FROM group_students gs WHERE gs.group_id = asg.group_id) AS student_count,
       (SELECT COUNT(DISTINCT a.user_id) FROM attempts a WHERE a.assignment_id = asg.id AND a.status = 'completed') AS completed_count,
       (SELECT ROUND(AVG(a.percentage), 1) FROM attempts a WHERE a.assignment_id = asg.id AND a.status = 'completed') AS avg_percentage
     FROM assignments asg JOIN tests tt ON tt.id = asg.test_id JOIN subjects s ON s.id = tt.subject_id
     WHERE asg.group_id = ? AND tt.status != 'draft'
     ORDER BY (asg.starts_at <= ? AND asg.ends_at >= ?) DESC, asg.ends_at DESC LIMIT 100`,
    groupId,
    t,
    t,
  );
  res.json({
    group,
    kpis: kpis(w),
    dynamics: dynamics(w),
    bySubject: bySubject(w),
    distribution: distribution(w),
    students,
    assignments: assignments.map((a) => ({
      ...a,
      state: t < a.starts_at ? 'upcoming' : t > a.ends_at || a.test_status === 'completed' ? 'finished' : 'active',
    })),
  });
});

analyticsRouter.get('/students/:id', (req, res) => {
  const me = user(req);
  const studentId = int(req.params.id);
  if (!canViewStudent(me, studentId)) throw forbidden();
  const student = get<any>(
    `SELECT id, first_name, last_name, phone, email, status, avatar_url, created_at, last_login_at, role FROM users WHERE id = ?`,
    studentId,
  );
  if (!student) throw notFound();
  const f = { ...readFilters(req.query as Record<string, unknown>), studentId };
  const full = me.role !== 'student' && (seesEverything(me) || leadsStudent(me, studentId));
  const w = attemptWhere(me, f, { fullScope: full });
  if (me.role === 'student') w.add('asg.show_result = 1');
  const groups = all(
    'SELECT g.id, g.name FROM group_students gs JOIN study_groups g ON g.id = gs.group_id WHERE gs.user_id = ?',
    studentId,
  );
  const attempts = all(
    `SELECT at.id, t.id AS test_id, t.teacher_id, t.title, s.name AS subject_name, t.topic, at.score, at.max_score, at.percentage,
       at.correct_count, at.wrong_count, at.skipped_count, at.duration_sec, at.completed_at, at.passed
     ${ATTEMPT_FROM} ${w.sql} ORDER BY at.completed_at DESC`,
    ...w.params,
  );
  const attemptsTotal = get<{ c: number }>('SELECT COUNT(*) AS c FROM attempts WHERE user_id = ?', studentId)!.c;
  const topics = byTopic(w) as any[];
  res.json({
    student,
    scope: full ? 'full' : 'own',
    groups,
    kpis: { ...kpis(w), attempts_total: attemptsTotal },
    dynamics: dynamics(w),
    bySubject: bySubject(w),
    weakTopics: topics.filter((t) => t.value < 60 && t.attempts >= 1).slice(0, 6),
    attempts,
  });
});

analyticsRouter.get('/admin', requireRole('admin', 'auditor'), (_req, res) => {
  const users = get<any>(
    `SELECT COUNT(*) AS total, SUM(role = 'student') AS students, SUM(role = 'teacher') AS teachers,
       SUM(role = 'admin') AS admins, SUM(role = 'auditor') AS auditors, SUM(status = 'blocked') AS blocked
     FROM users`,
  );
  const tests = get<any>(
    `SELECT SUM(status = 'published') AS active, SUM(status = 'completed') AS completed, SUM(status = 'draft') AS drafts,
       SUM(status = 'archived') AS archived, COUNT(*) AS total FROM tests`,
  );
  const attempts = get<any>(
    `SELECT COUNT(*) AS total, SUM(status = 'completed') AS completed, SUM(status = 'in_progress') AS in_progress,
       ROUND(AVG(CASE WHEN status = 'completed' THEN percentage END), 1) AS avg_percentage FROM attempts`,
  );
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const activity = all(
    `SELECT substr(created_at, 1, 10) AS date,
       SUM(action = 'auth.login') AS logins,
       SUM(action = 'attempt.finish') AS attempts,
       SUM(action = 'auth.login_failed') AS failed_logins
     FROM audit_log WHERE created_at >= ? GROUP BY 1 ORDER BY 1`,
    since,
  );
  const activeUsers = get<{ c: number }>(
    'SELECT COUNT(DISTINCT user_id) AS c FROM sessions WHERE last_seen_at >= ? AND revoked_at IS NULL',
    new Date(Date.now() - 7 * 86400_000).toISOString(),
  )!.c;

  const alerts: { type: string; params: Record<string, unknown>; level: 'info' | 'warning' | 'danger' }[] = [];
  const failed24 = get<{ c: number }>(
    "SELECT COUNT(*) AS c FROM audit_log WHERE action = 'auth.login_failed' AND created_at >= ?",
    new Date(Date.now() - 86400_000).toISOString(),
  )!.c;
  if (failed24 >= 10) alerts.push({ type: 'failed_logins', params: { count: failed24 }, level: 'danger' });
  const teacherRequests = get<{ c: number }>(
    "SELECT COUNT(*) AS c FROM users WHERE requested_role = 'teacher' AND role = 'student' AND status = 'active'",
  )!.c;
  if (teacherRequests) alerts.push({ type: 'teacher_requests', params: { count: teacherRequests }, level: 'warning' });
  if (users?.blocked) alerts.push({ type: 'blocked_users', params: { count: users.blocked }, level: 'warning' });
  const emptyPublished = get<{ c: number }>(
    "SELECT COUNT(*) AS c FROM tests t WHERE t.status = 'published' AND NOT EXISTS (SELECT 1 FROM assignments a WHERE a.test_id = t.id)",
  )!.c;
  if (emptyPublished) alerts.push({ type: 'unassigned_tests', params: { count: emptyPublished }, level: 'info' });
  const noTeacherGroups = get<{ c: number }>(
    "SELECT COUNT(*) AS c FROM study_groups g WHERE g.status = 'active' AND NOT EXISTS (SELECT 1 FROM group_teachers gt WHERE gt.group_id = g.id)",
  )!.c;
  if (noTeacherGroups) alerts.push({ type: 'groups_without_teacher', params: { count: noTeacherGroups }, level: 'warning' });
  const studentsNoGroup = get<{ c: number }>(
    "SELECT COUNT(*) AS c FROM users u WHERE u.role = 'student' AND u.status = 'active' AND NOT EXISTS (SELECT 1 FROM group_students gs WHERE gs.user_id = u.id)",
  )!.c;
  if (studentsNoGroup) alerts.push({ type: 'students_without_group', params: { count: studentsNoGroup }, level: 'info' });

  const recentAudit = all(
    'SELECT id, user_name, role, action, entity_type, entity_id, result, created_at FROM audit_log ORDER BY id DESC LIMIT 8',
  );
  res.json({ users, tests, attempts, activeUsers, activity, alerts, recentAudit, groups: get<any>('SELECT COUNT(*) AS c FROM study_groups')!.c });
});
