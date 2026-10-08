import { all, get, Where } from '../db.js';
import { int, qstr } from '../http.js';
import type { AuthUser } from '../types.js';
import { attemptScope } from './access.js';

export const ATTEMPT_FROM = `FROM attempts at
  JOIN tests t ON t.id = at.test_id
  JOIN subjects s ON s.id = t.subject_id
  JOIN users u ON u.id = at.user_id
  JOIN assignments asg ON asg.id = at.assignment_id
  LEFT JOIN study_groups g ON g.id = asg.group_id`;

export interface Filters {
  from?: string;
  to?: string;
  subjectId?: number;
  groupId?: number;
  testId?: number;
  teacherId?: number;
  studentId?: number;
  status?: string;
  minPct?: number;
  maxPct?: number;
  search?: string;
}

export function readFilters(q: Record<string, unknown>): Filters {
  const num = (v: unknown) => (v === undefined || v === '' ? undefined : int(v));
  const pct = (v: unknown) => (v === undefined || v === '' || isNaN(Number(v)) ? undefined : Number(v));
  return {
    from: qstr(q.from),
    to: qstr(q.to),
    subjectId: num(q.subjectId),
    groupId: num(q.groupId),
    testId: num(q.testId),
    teacherId: num(q.teacherId),
    studentId: num(q.studentId),
    status: qstr(q.status),
    minPct: pct(q.minPct),
    maxPct: pct(q.maxPct),
    search: qstr(q.search),
  };
}

/** WHERE clause over ATTEMPT_FROM: completed attempts within the user's access scope plus filters. */
export function attemptWhere(me: AuthUser, f: Filters, opts: { skipPeriod?: boolean } = {}): Where {
  const w = new Where().add("at.status = 'completed'");
  const scope = attemptScope(me);
  w.add(scope.sql, ...scope.params);
  if (!opts.skipPeriod) {
    if (f.from) w.add('at.completed_at >= ?', new Date(f.from).toISOString());
    if (f.to) w.add('at.completed_at <= ?', new Date(Date.parse(f.to) + (f.to.length <= 10 ? 86400_000 - 1 : 0)).toISOString());
  }
  if (f.subjectId) w.add('t.subject_id = ?', f.subjectId);
  if (f.testId) w.add('t.id = ?', f.testId);
  if (f.teacherId) w.add('t.teacher_id = ?', f.teacherId);
  if (f.studentId) w.add('at.user_id = ?', f.studentId);
  if (f.groupId) w.add('at.user_id IN (SELECT user_id FROM group_students WHERE group_id = ?)', f.groupId);
  if (f.status === 'passed') w.add('at.passed = 1');
  if (f.status === 'failed') w.add('at.passed = 0');
  if (f.minPct !== undefined) w.add('at.percentage >= ?', f.minPct);
  if (f.maxPct !== undefined) w.add('at.percentage <= ?', f.maxPct);
  if (f.search) {
    const like = `%${f.search.toLowerCase()}%`;
    w.add("(LOWER(u.first_name || ' ' || u.last_name) LIKE ? OR LOWER(t.title) LIKE ?)", like, like);
  }
  return w;
}

export function kpis(w: Where) {
  return get<any>(
    `SELECT COUNT(*) AS attempts, COUNT(DISTINCT at.user_id) AS students, COUNT(DISTINCT at.test_id) AS tests,
       ROUND(AVG(at.percentage), 1) AS avg_percentage, ROUND(AVG(at.score), 2) AS avg_score,
       MAX(at.percentage) AS max_percentage, MIN(at.percentage) AS min_percentage,
       ROUND(100.0 * SUM(at.passed) / NULLIF(COUNT(*), 0), 1) AS pass_rate,
       SUM(at.passed) AS passed, COUNT(*) - SUM(at.passed) AS failed,
       ROUND(AVG(at.duration_sec)) AS avg_duration_sec
     ${ATTEMPT_FROM} ${w.sql}`,
    ...w.params,
  );
}

export function distribution(w: Where) {
  const r = get<any>(
    `SELECT SUM(at.percentage >= 90) AS b90, SUM(at.percentage >= 70 AND at.percentage < 90) AS b70,
       SUM(at.percentage >= 50 AND at.percentage < 70) AS b50, SUM(at.percentage < 50) AS b0
     ${ATTEMPT_FROM} ${w.sql}`,
    ...w.params,
  );
  return [
    { bucket: '90-100', count: r?.b90 ?? 0 },
    { bucket: '70-89', count: r?.b70 ?? 0 },
    { bucket: '50-69', count: r?.b50 ?? 0 },
    { bucket: '0-49', count: r?.b0 ?? 0 },
  ];
}

export function dynamics(w: Where) {
  return all(
    `SELECT substr(at.completed_at, 1, 10) AS date, ROUND(AVG(at.percentage), 1) AS value, COUNT(*) AS attempts
     ${ATTEMPT_FROM} ${w.sql} GROUP BY 1 ORDER BY 1`,
    ...w.params,
  );
}

export function bySubject(w: Where) {
  return all(
    `SELECT s.id, s.name, ROUND(AVG(at.percentage), 1) AS value, COUNT(*) AS attempts
     ${ATTEMPT_FROM} ${w.sql} GROUP BY s.id ORDER BY value DESC`,
    ...w.params,
  );
}

export function byTopic(w: Where) {
  return all(
    `SELECT t.topic, s.name AS subject_name, ROUND(AVG(at.percentage), 1) AS value, COUNT(*) AS attempts
     ${ATTEMPT_FROM} ${w.sql} AND t.topic != '' GROUP BY t.topic, s.id ORDER BY value ASC`,
    ...w.params,
  );
}

export function hardQuestions(w: Where, limit = 8) {
  return all(
    `SELECT q.id, q.text, q.position, t.id AS test_id, t.title AS test_title,
       COUNT(*) AS answers,
       ROUND(100.0 * SUM(CASE WHEN sa.is_correct = 1 THEN 1 ELSE 0 END) / COUNT(*), 1) AS correct_pct
     ${ATTEMPT_FROM}
     JOIN student_answers sa ON sa.attempt_id = at.id
     JOIN questions q ON q.id = sa.question_id
     ${w.sql} GROUP BY q.id HAVING COUNT(*) >= 3 ORDER BY correct_pct ASC, answers DESC LIMIT ${limit}`,
    ...w.params,
  );
}

/** Same period length immediately before [from, to] — used for deltas. */
export function previousPeriod(f: Filters): Filters | null {
  if (!f.from) return null;
  const from = Date.parse(f.from);
  const to = f.to ? Date.parse(f.to) + 86400_000 : Date.now();
  const len = to - from;
  return { ...f, from: new Date(from - len).toISOString(), to: new Date(from - 1).toISOString() };
}
