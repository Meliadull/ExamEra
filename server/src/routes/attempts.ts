import { Router } from 'express';
import { z } from 'zod';
import { all, get, now, run, tx } from '../db.js';
import { badRequest, conflict, forbidden, HttpError, int, notFound, parse, requireAuth, requireRole, user } from '../http.js';
import { assertCanViewTest, loadTest } from '../services/access.js';
import { audit } from '../services/audit.js';
import {
  finalizeAttempt,
  shuffle,
  STUDENT_ASSIGNMENTS_SQL,
  studentIsTargeted,
  studentStatus,
  type AssignmentRow,
  type AttemptRow,
} from '../services/attempts.js';
import { loadQuestions } from '../services/tests.js';

export const attemptsRouter = Router();
export const studentRouter = Router();
attemptsRouter.use(requireAuth);
studentRouter.use(requireAuth, requireRole('student'));

const GRACE_MS = 5000;

function loadAttempt(id: number): AttemptRow {
  const a = get<AttemptRow>('SELECT * FROM attempts WHERE id = ?', id);
  if (!a) throw notFound('attempt_not_found');
  return a;
}

/** Closes the attempt if its time is up; returns the fresh row. */
function enforceDeadline(a: AttemptRow): AttemptRow {
  if (a.status === 'in_progress' && Date.parse(a.deadline_at) + GRACE_MS < Date.now()) {
    const asg = get<{ ends_at: string }>('SELECT ends_at FROM assignments WHERE id = ?', a.assignment_id)!;
    finalizeAttempt(a.id, a.deadline_at >= asg.ends_at ? 'deadline' : 'timeout');
    return loadAttempt(a.id);
  }
  return a;
}

attemptsRouter.post('/', requireRole('student'), (req, res) => {
  const me = user(req);
  const { assignmentId } = parse(z.object({ assignmentId: z.number().int().positive() }), req.body);
  const result = tx(() => {
    const asg = get<AssignmentRow>('SELECT * FROM assignments WHERE id = ?', assignmentId);
    if (!asg || !studentIsTargeted(asg, me.id)) throw forbidden('not_assigned');
    const test = loadTest(asg.test_id);
    if (test.status !== 'published') throw conflict('test_not_available');
    const active = get<AttemptRow>(
      "SELECT * FROM attempts WHERE assignment_id = ? AND user_id = ? AND status = 'in_progress'",
      asg.id,
      me.id,
    );
    if (active && Date.parse(active.deadline_at) + GRACE_MS >= Date.now()) return { id: active.id, resumed: true };
    if (active) finalizeAttempt(active.id, 'timeout');
    const t = now();
    if (t < asg.starts_at) throw conflict('test_not_started');
    if (t > asg.ends_at) throw conflict('test_deadline_passed');
    const used = get<{ c: number }>('SELECT COUNT(*) AS c FROM attempts WHERE assignment_id = ? AND user_id = ?', asg.id, me.id)!.c;
    if (used >= asg.attempts_limit) throw conflict('no_attempts_left');
    const questions = loadQuestions(test.id);
    if (!questions.length) throw conflict('test_not_available');
    const order = test.shuffle_questions ? shuffle(questions.map((q) => q.id)) : questions.map((q) => q.id);
    const optionOrder: Record<number, number[]> = {};
    if (test.shuffle_options) {
      for (const q of questions) if (q.type === 'single' || q.type === 'multiple') optionOrder[q.id] = shuffle(q.options.map((o) => o.id));
    }
    const duration = asg.duration_min ?? test.duration_min;
    const byDuration = duration ? Date.now() + duration * 60_000 : Infinity;
    const deadline = new Date(Math.min(byDuration, Date.parse(asg.ends_at))).toISOString();
    const { id } = run(
      `INSERT INTO attempts (assignment_id, test_id, user_id, status, started_at, deadline_at, question_order, option_order, ip)
       VALUES (?, ?, ?, 'in_progress', ?, ?, ?, ?, ?)`,
      asg.id,
      test.id,
      me.id,
      t,
      deadline,
      JSON.stringify(order),
      JSON.stringify(optionOrder),
      req.ip ?? null,
    );
    return { id, resumed: false, testId: test.id, attemptNo: used + 1 };
  });
  if (!result.resumed) {
    audit(req, 'attempt.start', { entityType: 'attempt', entityId: result.id, metadata: { testId: result.testId, attemptNo: result.attemptNo } });
  }
  res.status(result.resumed ? 200 : 201).json(result);
});

attemptsRouter.get('/:id', (req, res) => {
  const me = user(req);
  let a = loadAttempt(int(req.params.id));
  if (a.user_id !== me.id) throw forbidden();
  a = enforceDeadline(a);
  if (a.status === 'completed') return res.json({ id: a.id, status: 'completed' });
  const test = loadTest(a.test_id);
  const subject = get<{ name: string }>('SELECT name FROM subjects WHERE id = ?', test.subject_id)!;
  const questions = loadQuestions(test.id);
  const byId = new Map(questions.map((q) => [q.id, q]));
  const optionOrder: Record<string, number[]> = JSON.parse(a.option_order);
  const ordered = (JSON.parse(a.question_order) as number[])
    .map((qid) => byId.get(qid))
    .filter((q): q is NonNullable<typeof q> => !!q)
    .map((q) => {
      const order = optionOrder[q.id];
      const opts = order ? order.map((oid) => q.options.find((o) => o.id === oid)!).filter(Boolean) : q.options;
      return {
        id: q.id,
        type: q.type,
        text: q.text,
        image_url: q.image_url,
        score: q.score,
        // Correctness is never sent while the attempt is running; short-text accepted answers are hidden entirely.
        options: q.type === 'short_text' ? [] : opts.map((o) => ({ id: o.id, text: o.text })),
      };
    });
  const answers = Object.fromEntries(
    all<{ question_id: number; answer: string | null; flagged: number }>(
      'SELECT question_id, answer, flagged FROM student_answers WHERE attempt_id = ?',
      a.id,
    ).map((r) => [r.question_id, { answer: r.answer ? JSON.parse(r.answer) : null, flagged: !!r.flagged }]),
  );
  res.json({
    id: a.id,
    status: a.status,
    started_at: a.started_at,
    deadline_at: a.deadline_at,
    server_now: now(),
    test: { id: test.id, title: test.title, subject: subject.name, instruction: test.instruction, topic: test.topic },
    questions: ordered,
    answers,
  });
});

const answerBody = z.object({
  questionId: z.number().int().positive(),
  answer: z.union([z.number().int(), z.array(z.number().int()).max(20), z.string().max(1000), z.null()]),
  flagged: z.boolean().optional(),
});

function saveAnswers(a: AttemptRow, items: z.infer<typeof answerBody>[]) {
  const qids = new Set(JSON.parse(a.question_order) as number[]);
  const t = now();
  tx(() => {
    for (const it of items) {
      if (!qids.has(it.questionId)) throw badRequest('question_not_in_attempt');
      run(
        `INSERT INTO student_answers (attempt_id, question_id, answer, flagged, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (attempt_id, question_id) DO UPDATE SET answer = excluded.answer,
           flagged = COALESCE(?, flagged), updated_at = excluded.updated_at`,
        a.id,
        it.questionId,
        it.answer === null || (Array.isArray(it.answer) && !it.answer.length) || it.answer === '' ? null : JSON.stringify(it.answer),
        it.flagged ?? false,
        t,
        it.flagged === undefined ? null : it.flagged,
      );
    }
  });
  return t;
}

attemptsRouter.put('/:id/answers', (req, res) => {
  const me = user(req);
  let a = loadAttempt(int(req.params.id));
  if (a.user_id !== me.id) throw forbidden();
  a = enforceDeadline(a);
  if (a.status !== 'in_progress') throw conflict('attempt_closed');
  const b = parse(z.object({ answers: z.array(answerBody).min(1).max(300) }), req.body);
  res.json({ savedAt: saveAnswers(a, b.answers) });
});

attemptsRouter.post('/:id/finish', (req, res) => {
  const me = user(req);
  let a = loadAttempt(int(req.params.id));
  if (a.user_id !== me.id) throw forbidden();
  a = enforceDeadline(a);
  if (a.status === 'in_progress') {
    const b = parse(z.object({ answers: z.array(answerBody).max(300).optional() }), req.body ?? {});
    if (b.answers?.length) saveAnswers(a, b.answers);
    finalizeAttempt(a.id, 'manual');
  }
  res.json({ id: a.id, status: 'completed' });
});

attemptsRouter.get('/:id/result', (req, res) => {
  const me = user(req);
  let a = loadAttempt(int(req.params.id));
  const test = loadTest(a.test_id);
  const isOwner = a.user_id === me.id;
  if (!isOwner) assertCanViewTest(me, test);
  a = enforceDeadline(a);
  if (a.status !== 'completed') throw conflict('attempt_in_progress');
  const asg = get<AssignmentRow>('SELECT * FROM assignments WHERE id = ?', a.assignment_id)!;
  const student = get<any>('SELECT id, first_name, last_name FROM users WHERE id = ?', a.user_id);
  const subject = get<{ name: string }>('SELECT name FROM subjects WHERE id = ?', test.subject_id)!;
  const staff = !isOwner || me.role !== 'student';

  const used = get<{ c: number }>('SELECT COUNT(*) AS c FROM attempts WHERE assignment_id = ? AND user_id = ?', asg.id, a.user_id)!.c;
  const finishedForGood = used >= asg.attempts_limit || now() > asg.ends_at;
  const showResult = staff || !!asg.show_result;
  const showAnswers = staff || (!!asg.show_answers && finishedForGood);

  const base = {
    id: a.id,
    status: a.status,
    test: { id: test.id, title: test.title, subject: subject.name },
    student,
    started_at: a.started_at,
    completed_at: a.completed_at,
    duration_sec: a.duration_sec,
    finish_reason: a.finish_reason,
    show_result: showResult,
    show_answers: showAnswers,
    answers_after_end: !staff && !!asg.show_answers && !finishedForGood,
    pass_score: asg.pass_score,
    can_retry: isOwner && used < asg.attempts_limit && now() <= asg.ends_at && test.status === 'published',
    assignment_id: asg.id,
  };
  if (!showResult) return res.json(base);

  const summary = {
    score: a.score,
    max_score: a.max_score,
    percentage: a.percentage,
    correct_count: a.correct_count,
    wrong_count: a.wrong_count,
    skipped_count: a.skipped_count,
    passed: !!a.passed,
  };
  if (!showAnswers) return res.json({ ...base, ...summary });

  const answers = new Map(
    all<{ question_id: number; answer: string | null; is_correct: number | null; score: number | null }>(
      'SELECT question_id, answer, is_correct, score FROM student_answers WHERE attempt_id = ?',
      a.id,
    ).map((r) => [r.question_id, r]),
  );
  const byId = new Map(loadQuestions(test.id).map((q) => [q.id, q]));
  const review = (JSON.parse(a.question_order) as number[])
    .map((qid) => byId.get(qid))
    .filter((q): q is NonNullable<typeof q> => !!q)
    .map((q) => {
      const ans = answers.get(q.id);
      return {
        id: q.id,
        type: q.type,
        text: q.text,
        image_url: q.image_url,
        explanation: q.explanation,
        max_score: q.score,
        score: ans?.score ?? 0,
        is_correct: ans?.is_correct ?? null,
        answer: ans?.answer ? JSON.parse(ans.answer) : null,
        options: q.options.map((o) => ({ id: o.id, text: o.text, is_correct: !!o.is_correct })),
      };
    });
  res.json({ ...base, ...summary, review });
});

/** Administrative score correction (recorded in the audit log). */
attemptsRouter.patch('/:id/score', requireRole('admin'), (req, res) => {
  const a = loadAttempt(int(req.params.id));
  if (a.status !== 'completed') throw conflict('attempt_in_progress');
  const b = parse(z.object({ score: z.number().min(0), reason: z.string().trim().min(3).max(500) }), req.body);
  if (b.score > (a.max_score ?? 0)) throw badRequest('score_exceeds_max');
  const asg = get<AssignmentRow>('SELECT pass_score FROM assignments WHERE id = ?', a.assignment_id)!;
  const pct = a.max_score ? Math.round((b.score / a.max_score) * 1000) / 10 : 0;
  run('UPDATE attempts SET score = ?, percentage = ?, passed = ? WHERE id = ?', b.score, pct, pct >= asg.pass_score, a.id);
  audit(req, 'result.admin_change', {
    entityType: 'attempt',
    entityId: a.id,
    metadata: { from: a.score, to: b.score, fromPct: a.percentage, toPct: pct, reason: b.reason },
  });
  res.json({ ok: true, percentage: pct });
});

/* ---------- Student area ---------- */

function myAssignments(userId: number) {
  return all<any>(STUDENT_ASSIGNMENTS_SQL, { uid: userId } as any).map((r) => {
    const status = studentStatus(r);
    const hide = !r.show_result;
    return { ...r, status, best_percentage: hide ? null : r.best_percentage };
  });
}

studentRouter.get('/tests', (req, res) => {
  res.json(myAssignments(user(req).id));
});

studentRouter.get('/dashboard', (req, res) => {
  const me = user(req);
  const list = myAssignments(me.id);
  const count = (s: string) => list.filter((r) => r.status === s).length;
  const stats = get<any>(
    `SELECT COUNT(*) AS completed, ROUND(AVG(at.percentage), 1) AS avg_percentage, MAX(at.percentage) AS best_percentage,
       ROUND(AVG(at.duration_sec)) AS avg_duration_sec
     FROM attempts at JOIN assignments asg ON asg.id = at.assignment_id
     WHERE at.user_id = ? AND at.status = 'completed' AND asg.show_result = 1`,
    me.id,
  );
  const recent = all(
    `SELECT at.id, at.percentage, at.score, at.max_score, at.completed_at, at.passed, t.title, s.name AS subject_name, asg.show_result
     FROM attempts at JOIN tests t ON t.id = at.test_id JOIN subjects s ON s.id = t.subject_id JOIN assignments asg ON asg.id = at.assignment_id
     WHERE at.user_id = ? AND at.status = 'completed' ORDER BY at.completed_at DESC LIMIT 5`,
    me.id,
  ).map((r: any) => (r.show_result ? r : { ...r, percentage: null, score: null, passed: null }));
  const dynamics = all(
    `SELECT substr(at.completed_at, 1, 10) AS date, ROUND(AVG(at.percentage), 1) AS value
     FROM attempts at JOIN assignments asg ON asg.id = at.assignment_id
     WHERE at.user_id = ? AND at.status = 'completed' AND asg.show_result = 1 GROUP BY 1 ORDER BY 1 LIMIT 60`,
    me.id,
  );
  res.json({
    counts: { available: count('available'), scheduled: count('scheduled'), completed: count('completed'), overdue: count('overdue') },
    stats,
    upcoming: list.filter((r) => r.status === 'available' || r.status === 'scheduled').slice(0, 6),
    recent,
    dynamics,
  });
});

studentRouter.get('/attempts', (req, res) => {
  const me = user(req);
  const rows = all<any>(
    `SELECT at.id, at.status, at.started_at, at.completed_at, at.duration_sec, at.score, at.max_score, at.percentage,
       at.correct_count, at.wrong_count, at.skipped_count, at.passed, at.finish_reason, at.assignment_id,
       t.title, t.id AS test_id, s.name AS subject_name, asg.show_result
     FROM attempts at JOIN tests t ON t.id = at.test_id JOIN subjects s ON s.id = t.subject_id JOIN assignments asg ON asg.id = at.assignment_id
     WHERE at.user_id = ? ORDER BY at.started_at DESC`,
    me.id,
  );
  res.json(
    rows.map((r) =>
      r.show_result
        ? r
        : { ...r, score: null, percentage: null, correct_count: null, wrong_count: null, skipped_count: null, passed: null },
    ),
  );
});

