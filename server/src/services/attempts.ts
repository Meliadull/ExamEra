import crypto from 'node:crypto';
import { all, get, now, run, tx } from '../db.js';
import { audit } from './audit.js';
import { notify } from './notify.js';
import { isAnswered, scoreAnswer } from './scoring.js';
import { loadQuestions } from './tests.js';

export interface AssignmentRow {
  id: number;
  test_id: number;
  group_id: number | null;
  user_id: number | null;
  starts_at: string;
  ends_at: string;
  duration_min: number | null;
  attempts_limit: number;
  pass_score: number;
  show_result: number;
  show_answers: number;
  created_by: number;
  created_at: string;
}

export interface AttemptRow {
  id: number;
  assignment_id: number;
  test_id: number;
  user_id: number;
  status: 'in_progress' | 'completed';
  started_at: string;
  deadline_at: string;
  completed_at: string | null;
  score: number | null;
  max_score: number | null;
  percentage: number | null;
  correct_count: number | null;
  wrong_count: number | null;
  skipped_count: number | null;
  duration_sec: number | null;
  passed: number | null;
  finish_reason: string | null;
  question_order: string;
  option_order: string;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Student ids targeted by an assignment (whole group or a single student). */
export function assignmentStudentIds(a: Pick<AssignmentRow, 'group_id' | 'user_id'>): number[] {
  if (a.user_id) return [a.user_id];
  return all<{ user_id: number }>(
    `SELECT gs.user_id FROM group_students gs JOIN users u ON u.id = gs.user_id
     WHERE gs.group_id = ? AND u.role = 'student' AND u.status = 'active'`,
    a.group_id,
  ).map((r) => r.user_id);
}

export function studentIsTargeted(a: AssignmentRow, userId: number) {
  if (a.user_id) return a.user_id === userId;
  return !!get('SELECT 1 FROM group_students WHERE group_id = ? AND user_id = ?', a.group_id, userId);
}

export const STUDENT_ASSIGNMENTS_SQL = `
  SELECT asg.*, t.title, t.topic, t.description, t.instruction, t.status AS test_status,
         s.name AS subject_name, s.id AS subject_id,
         g.name AS group_name,
         (SELECT COUNT(*) FROM questions q WHERE q.test_id = t.id) AS question_count,
         -- Attempts are counted per test, not per assignment: the same test assigned twice
         -- (e.g. to two groups the student belongs to) must not grant extra attempts.
         (SELECT COUNT(*) FROM attempts a WHERE a.test_id = t.id AND a.user_id = :uid) AS attempts_used,
         (SELECT COUNT(*) FROM attempts a WHERE a.test_id = t.id AND a.user_id = :uid AND a.status = 'completed') AS attempts_completed,
         (SELECT a.id FROM attempts a WHERE a.test_id = t.id AND a.user_id = :uid AND a.status = 'in_progress' LIMIT 1) AS active_attempt_id,
         (SELECT MAX(a.percentage) FROM attempts a WHERE a.test_id = t.id AND a.user_id = :uid AND a.status = 'completed') AS best_percentage,
         (SELECT a.id FROM attempts a WHERE a.test_id = t.id AND a.user_id = :uid AND a.status = 'completed' ORDER BY a.completed_at DESC LIMIT 1) AS last_attempt_id
  FROM assignments asg
  JOIN tests t ON t.id = asg.test_id
  JOIN subjects s ON s.id = t.subject_id
  LEFT JOIN study_groups g ON g.id = asg.group_id
  WHERE (asg.user_id = :uid OR asg.group_id IN (SELECT group_id FROM group_students WHERE user_id = :uid))
    AND t.status IN ('published', 'completed')
  ORDER BY asg.ends_at`;

export type StudentTestStatus = 'available' | 'scheduled' | 'completed' | 'overdue';

export function studentStatus(r: {
  starts_at: string;
  ends_at: string;
  attempts_limit: number;
  attempts_used: number;
  attempts_completed: number;
  active_attempt_id: number | null;
  test_status: string;
}): StudentTestStatus {
  const t = now();
  // All allowed attempts already finished: the test is done even if an extra attempt was opened earlier.
  if (r.attempts_completed >= r.attempts_limit) return 'completed';
  if (r.active_attempt_id) return 'available';
  if (t < r.starts_at) return 'scheduled';
  const open = t <= r.ends_at && r.test_status === 'published' && r.attempts_used < r.attempts_limit;
  if (open) return 'available';
  return r.attempts_completed > 0 ? 'completed' : 'overdue';
}

/** Scores and closes an attempt; idempotent. Returns true if the attempt was finalized by this call. */
export function finalizeAttempt(attemptId: number, reason: 'manual' | 'timeout' | 'deadline'): boolean {
  const done = tx(() => {
    const at = get<AttemptRow>('SELECT * FROM attempts WHERE id = ?', attemptId);
    if (!at || at.status !== 'in_progress') return null;
    const test = get<{ multiple_scoring: 'strict' | 'partial'; teacher_id: number; title: string }>(
      'SELECT multiple_scoring, teacher_id, title FROM tests WHERE id = ?',
      at.test_id,
    )!;
    const asg = get<AssignmentRow>('SELECT * FROM assignments WHERE id = ?', at.assignment_id)!;
    const questions = loadQuestions(at.test_id);
    const answers = new Map(
      all<{ question_id: number; answer: string | null }>(
        'SELECT question_id, answer FROM student_answers WHERE attempt_id = ?',
        at.id,
      ).map((a) => [a.question_id, a.answer ? JSON.parse(a.answer) : null]),
    );
    const t = now();
    let score = 0;
    let max = 0;
    let correct = 0;
    let wrong = 0;
    let skipped = 0;
    for (const q of questions) {
      max += q.score;
      const ans = answers.get(q.id) ?? null;
      const r = scoreAnswer(q, ans, test.multiple_scoring);
      if (!r.answered) skipped++;
      else if (r.isCorrect) correct++;
      else wrong++;
      score += r.score;
      run(
        `INSERT INTO student_answers (attempt_id, question_id, answer, is_correct, score, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (attempt_id, question_id) DO UPDATE SET is_correct = excluded.is_correct, score = excluded.score`,
        at.id,
        q.id,
        isAnswered(q.type, ans) ? JSON.stringify(ans) : null,
        r.answered ? (r.isCorrect ? 1 : 0) : null,
        r.score,
        t,
      );
    }
    score = Math.round(score * 100) / 100;
    const pct = max > 0 ? Math.round((score / max) * 1000) / 10 : 0;
    const completedAt = reason === 'manual' ? t : at.deadline_at < t ? at.deadline_at : t;
    const duration = Math.max(0, Math.round((Date.parse(completedAt) - Date.parse(at.started_at)) / 1000));
    run(
      `UPDATE attempts SET status = 'completed', completed_at = ?, score = ?, max_score = ?, percentage = ?,
         correct_count = ?, wrong_count = ?, skipped_count = ?, duration_sec = ?, passed = ?, finish_reason = ?
       WHERE id = ?`,
      completedAt,
      score,
      max,
      pct,
      correct,
      wrong,
      skipped,
      duration,
      pct >= asg.pass_score,
      reason,
      at.id,
    );
    return { at, asg, test, pct };
  });
  if (!done) return false;

  const { at, asg, test, pct } = done;
  const student = get<{ id: number; first_name: string; last_name: string; role: string }>(
    'SELECT id, first_name, last_name, role FROM users WHERE id = ?',
    at.user_id,
  )!;
  const studentName = `${student.first_name} ${student.last_name}`;
  audit(null, 'attempt.finish', {
    actor: { id: student.id, role: student.role, name: studentName },
    entityType: 'attempt',
    entityId: at.id,
    metadata: { testId: at.test_id, reason, percentage: pct },
  });
  notify(test.teacher_id, 'attempt_completed', { student: studentName, test: test.title, percentage: pct }, `/app/tests/${at.test_id}`);

  if (asg.group_id) {
    const targeted = assignmentStudentIds(asg).length;
    const finished = get<{ c: number }>(
      "SELECT COUNT(DISTINCT user_id) AS c FROM attempts WHERE assignment_id = ? AND status = 'completed'",
      asg.id,
    )!.c;
    if (targeted > 0 && finished >= targeted) {
      const group = get<{ name: string }>('SELECT name FROM study_groups WHERE id = ?', asg.group_id);
      notify(
        test.teacher_id,
        'group_completed',
        { group: group?.name ?? '', test: test.title },
        `/app/tests/${at.test_id}`,
        `group_completed:${asg.id}`,
      );
    }
  }
  return true;
}

/** Background jobs: auto-finish expired attempts and send "deadline soon" reminders. */
export function runPeriodicJobs() {
  const t = now();
  const expired = all<{ id: number; deadline_at: string; ends_at: string }>(
    `SELECT at.id, at.deadline_at, asg.ends_at FROM attempts at JOIN assignments asg ON asg.id = at.assignment_id
     WHERE at.status = 'in_progress' AND at.deadline_at < ?`,
    new Date(Date.now() - 5000).toISOString(),
  );
  for (const e of expired) finalizeAttempt(e.id, e.deadline_at >= e.ends_at ? 'deadline' : 'timeout');

  const soon = all<AssignmentRow & { title: string }>(
    `SELECT asg.*, t.title FROM assignments asg JOIN tests t ON t.id = asg.test_id
     WHERE asg.reminded_at IS NULL AND t.status = 'published' AND asg.ends_at > ? AND asg.ends_at <= ? AND asg.starts_at <= ?`,
    t,
    new Date(Date.now() + 24 * 3600_000).toISOString(),
    t,
  );
  for (const a of soon) {
    for (const uid of assignmentStudentIds(a)) {
      const done = get(
        "SELECT 1 FROM attempts WHERE assignment_id = ? AND user_id = ? AND status = 'completed'",
        a.id,
        uid,
      );
      if (!done) notify(uid, 'deadline_soon', { test: a.title, endsAt: a.ends_at }, '/app/my-tests', `deadline_soon:${a.id}`);
    }
    run('UPDATE assignments SET reminded_at = ? WHERE id = ?', t, a.id);
  }
}
