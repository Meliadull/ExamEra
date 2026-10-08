import ExcelJS from 'exceljs';
import { Router } from 'express';
import { z } from 'zod';
import { all, get, getSetting, now, run, tx, Where } from '../db.js';
import { badRequest, conflict, forbidden, int, notFound, parse, qstr, requireAuth, requireRole, user } from '../http.js';
import { assertCanEditTest, assertCanViewTest, loadTest, seesEverything } from '../services/access.js';
import { audit } from '../services/audit.js';
import { loadQuestions, questionInput, replaceQuestions, testHasAttempts, validateQuestion, type QuestionInput } from '../services/tests.js';
import { decodeBase64, isXlsx, saveImage } from '../services/uploads.js';

export const testsRouter = Router();
export const uploadsRouter = Router();
testsRouter.use(requireAuth);
uploadsRouter.use(requireAuth);

const isoDate = z.string().datetime({ offset: true }).nullable().optional();

const testMeta = z.object({
  title: z.string().trim().min(1).max(200),
  subjectId: z.number().int().positive(),
  topic: z.string().trim().max(200).default(''),
  description: z.string().trim().max(5000).default(''),
  instruction: z.string().trim().max(5000).default(''),
  durationMin: z.number().int().min(1).max(600).nullable().optional(),
  attemptsLimit: z.number().int().min(1).max(20).default(1),
  passScore: z.number().int().min(0).max(100).optional(),
  shuffleQuestions: z.boolean().default(false),
  shuffleOptions: z.boolean().default(false),
  showResult: z.boolean().default(true),
  showAnswers: z.boolean().default(false),
  multipleScoring: z.enum(['strict', 'partial']).default('strict'),
  startsAt: isoDate,
  endsAt: isoDate,
});
type TestMeta = z.infer<typeof testMeta>;

function metaParams(m: TestMeta) {
  return [
    m.title,
    m.subjectId,
    m.topic,
    m.description,
    m.instruction,
    m.durationMin ?? null,
    m.attemptsLimit,
    m.passScore ?? (Number(getSetting("default_pass_score")) || 60),
    m.shuffleQuestions,
    m.shuffleOptions,
    m.showResult,
    m.showAnswers,
    m.multipleScoring,
    m.startsAt ? new Date(m.startsAt).toISOString() : null,
    m.endsAt ? new Date(m.endsAt).toISOString() : null,
  ];
}

function assertSubject(id: number) {
  if (!get('SELECT 1 FROM subjects WHERE id = ?', id)) throw badRequest('subject_not_found');
}

testsRouter.get('/', (req, res) => {
  const me = user(req);
  if (me.role === 'student') throw forbidden();
  const q = req.query as Record<string, string>;
  const w = new Where();
  if (!seesEverything(me)) w.add('t.teacher_id = ?', me.id);
  const search = qstr(q.search);
  if (search) w.add('(LOWER(t.title) LIKE ? OR LOWER(t.topic) LIKE ?)', `%${search.toLowerCase()}%`, `%${search.toLowerCase()}%`);
  if (q.subjectId) w.add('t.subject_id = ?', int(q.subjectId));
  if (q.status) w.add('t.status = ?', q.status);
  else w.add("t.status != 'archived'");
  if (q.teacherId) w.add('t.teacher_id = ?', int(q.teacherId));
  const rows = all(
    `SELECT t.id, t.title, t.topic, t.status, t.created_at, t.updated_at, t.duration_min, t.attempts_limit,
       s.name AS subject_name, t.subject_id, u.first_name || ' ' || u.last_name AS teacher_name,
       (SELECT COUNT(*) FROM questions q WHERE q.test_id = t.id) AS question_count,
       (SELECT COALESCE(SUM(score), 0) FROM questions q WHERE q.test_id = t.id) AS max_score,
       (SELECT COUNT(DISTINCT a.user_id) FROM attempts a WHERE a.test_id = t.id AND a.status = 'completed') AS participants,
       (SELECT ROUND(AVG(a.percentage), 1) FROM attempts a WHERE a.test_id = t.id AND a.status = 'completed') AS avg_percentage,
       (SELECT COUNT(*) FROM assignments asg WHERE asg.test_id = t.id) AS assignment_count
     FROM tests t JOIN subjects s ON s.id = t.subject_id JOIN users u ON u.id = t.teacher_id
     ${w.sql} ORDER BY t.updated_at DESC`,
    ...w.params,
  );
  res.json(rows);
});

testsRouter.post('/', requireRole('teacher', 'admin'), (req, res) => {
  const me = user(req);
  const b = parse(
    testMeta.extend({ questions: z.array(questionInput).max(300).optional(), source: z.enum(['builder', 'import']).optional() }),
    req.body,
  );
  assertSubject(b.subjectId);
  const t = now();
  const id = tx(() => {
    const { id } = run(
      `INSERT INTO tests (title, subject_id, topic, description, instruction, duration_min, attempts_limit, pass_score,
         shuffle_questions, shuffle_options, show_result, show_answers, multiple_scoring, starts_at, ends_at,
         teacher_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
      ...metaParams(b),
      me.id,
      t,
      t,
    );
    if (b.questions?.length) replaceQuestions(id, b.questions);
    return id;
  });
  audit(req, b.source === 'import' ? 'test.import' : 'test.create', {
    entityType: 'test',
    entityId: id,
    metadata: { title: b.title, questions: b.questions?.length ?? 0 },
  });
  res.status(201).json({ id });
});

testsRouter.get('/import/template', requireRole('teacher', 'admin'), async (_req, res) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Test');
  ws.columns = [
    { header: '№', width: 6 },
    { header: 'Вопрос', width: 50 },
    { header: 'Ответ A', width: 18 },
    { header: 'Ответ B', width: 18 },
    { header: 'Ответ C', width: 18 },
    { header: 'Ответ D', width: 18 },
    { header: 'Правильный ответ', width: 20 },
    { header: 'Балл', width: 8 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.addRow([1, 'Какой результат выражения 5 × 4?', '10', '15', '20', '25', 'C', 1]);
  ws.addRow([2, 'Какие из чисел являются простыми?', '2', '4', '7', '9', 'A,C', 2]);
  ws.addRow([3, 'Столица Узбекистана (короткий ответ)', '', '', '', '', 'Ташкент', 1]);
  const help = wb.addWorksheet('Инструкция');
  help.addRows([
    ['Правильный ответ: одна буква (A–D) — один правильный ответ.'],
    ['Несколько букв через запятую (A,C) — несколько правильных ответов.'],
    ['Если варианты A–D пустые, «Правильный ответ» — текст короткого ответа (несколько вариантов через «;»).'],
    ['Формулы можно записывать в формате LaTeX между знаками $...$, например $x^2 + 1$.'],
  ]);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="examera-template.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as any;
    if (Array.isArray(o.richText)) return o.richText.map((r: any) => r.text).join('').trim();
    if ('result' in o) return cellText(o.result);
    if ('text' in o) return String(o.text).trim();
    return '';
  }
  return String(v).trim();
}

testsRouter.post('/import/preview', requireRole('teacher', 'admin'), async (req, res) => {
  const { data } = parse(z.object({ data: z.string().min(10).max(8_000_000), fileName: z.string().max(255).optional() }), req.body);
  const buf = decodeBase64(data);
  if (buf.length > 5 * 1024 * 1024) throw badRequest('file_too_large');
  if (!isXlsx(buf)) throw badRequest('not_xlsx');
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as any);
  } catch {
    throw badRequest('xlsx_unreadable');
  }
  const ws = wb.worksheets[0];
  if (!ws) throw badRequest('xlsx_empty');

  const header = (ws.getRow(1).values as ExcelJS.CellValue[]).map((v) => cellText(v).toLowerCase());
  const find = (...names: string[]) => header.findIndex((h) => names.some((n) => h === n || h.startsWith(n)));
  const col = {
    question: find('вопрос', 'savol', 'question'),
    a: find('ответ a', 'javob a', 'answer a', 'a'),
    b: find('ответ b', 'javob b', 'answer b', 'b'),
    c: find('ответ c', 'javob c', 'answer c', 'c'),
    d: find('ответ d', 'javob d', 'answer d', 'd'),
    correct: find('правильный', "to'g'ri", 'togri', 'correct'),
    score: find('балл', 'ball', 'score', 'points'),
  };
  const missing = Object.entries(col).filter(([k, v]) => v < 0 && k !== 'score').map(([k]) => k);
  if (missing.length) throw badRequest('xlsx_bad_structure', { missing });

  const questions: (QuestionInput & { row: number; errors: string[] })[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const vals = row.values as ExcelJS.CellValue[];
    const text = cellText(vals[col.question]);
    const opts = [col.a, col.b, col.c, col.d].map((i) => cellText(vals[i]));
    const correctRaw = cellText(vals[col.correct]);
    if (!text && !opts.some(Boolean) && !correctRaw) return;
    const scoreRaw = col.score >= 0 ? Number(cellText(vals[col.score]).replace(',', '.')) : 1;
    const errors: string[] = [];
    if (!text) errors.push('missing_question');
    if (!correctRaw) errors.push('missing_correct');
    const score = Number.isFinite(scoreRaw) && scoreRaw > 0 ? scoreRaw : (errors.push('invalid_score'), 1);
    let q: QuestionInput;
    if (!opts.some(Boolean)) {
      q = {
        type: 'short_text',
        text,
        score,
        explanation: '',
        options: correctRaw.split(';').map((s) => ({ text: s.trim(), isCorrect: true })).filter((o) => o.text),
      };
    } else {
      const letters = correctRaw.toUpperCase().split(/[,;\s]+/).filter(Boolean);
      const idx = letters.map((l) => 'ABCD'.indexOf(l));
      if (idx.some((i) => i < 0 || !opts[i])) errors.push('invalid_correct');
      q = {
        type: letters.length > 1 ? 'multiple' : 'single',
        text,
        score,
        explanation: '',
        options: opts.map((o, i) => ({ text: o, isCorrect: idx.includes(i) })).filter((o) => o.text),
      };
    }
    if (!errors.length) errors.push(...validateQuestion(q));
    questions.push({ ...q, row: rowNumber, errors });
  });
  if (!questions.length) throw badRequest('xlsx_empty');
  res.json({ questions, errorCount: questions.filter((q) => q.errors.length).length });
});

testsRouter.get('/:id', (req, res) => {
  const me = user(req);
  const t = loadTest(int(req.params.id));
  assertCanViewTest(me, t);
  const extra = get<any>(
    `SELECT s.name AS subject_name, u.first_name || ' ' || u.last_name AS teacher_name
     FROM subjects s, users u WHERE s.id = ? AND u.id = ?`,
    t.subject_id,
    t.teacher_id,
  );
  res.json({
    ...t,
    ...extra,
    questions: loadQuestions(t.id),
    has_attempts: testHasAttempts(t.id),
    can_edit: me.role === 'admin' || (me.role === 'teacher' && t.teacher_id === me.id),
  });
});

testsRouter.patch('/:id', (req, res) => {
  const me = user(req);
  const t = loadTest(int(req.params.id));
  assertCanEditTest(me, t);
  if (t.status === 'archived') throw conflict('test_archived');
  const b = parse(testMeta, req.body);
  assertSubject(b.subjectId);
  run(
    `UPDATE tests SET title = ?, subject_id = ?, topic = ?, description = ?, instruction = ?, duration_min = ?, attempts_limit = ?,
       pass_score = ?, shuffle_questions = ?, shuffle_options = ?, show_result = ?, show_answers = ?, multiple_scoring = ?,
       starts_at = ?, ends_at = ?, updated_at = ? WHERE id = ?`,
    ...metaParams(b),
    now(),
    t.id,
  );
  audit(req, 'test.update', { entityType: 'test', entityId: t.id, metadata: { title: b.title, part: 'meta' } });
  res.json({ ok: true });
});

testsRouter.put('/:id/questions', (req, res) => {
  const me = user(req);
  const t = loadTest(int(req.params.id));
  assertCanEditTest(me, t);
  if (t.status === 'archived') throw conflict('test_archived');
  if (testHasAttempts(t.id)) throw conflict('test_has_attempts');
  const { questions } = parse(z.object({ questions: z.array(questionInput).max(300) }), req.body);
  if (t.status === 'published' && !questions.length) throw badRequest('test_needs_questions');
  replaceQuestions(t.id, questions);
  run('UPDATE tests SET updated_at = ? WHERE id = ?', now(), t.id);
  audit(req, 'test.update', { entityType: 'test', entityId: t.id, metadata: { part: 'questions', count: questions.length } });
  res.json({ questions: loadQuestions(t.id) });
});

const STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ['published', 'archived'],
  published: ['completed', 'archived', 'draft'],
  completed: ['published', 'archived'],
  archived: ['draft'],
};

testsRouter.post('/:id/status', (req, res) => {
  const me = user(req);
  const t = loadTest(int(req.params.id));
  assertCanEditTest(me, t);
  const { status } = parse(z.object({ status: z.enum(['draft', 'published', 'completed', 'archived']) }), req.body);
  if (!STATUS_TRANSITIONS[t.status].includes(status)) throw conflict('invalid_status_transition');
  if (status === 'published') {
    const qs = loadQuestions(t.id);
    if (!qs.length) throw badRequest('test_needs_questions');
  }
  if (status === 'draft' && t.status === 'published' && get('SELECT 1 FROM assignments WHERE test_id = ?', t.id)) {
    throw conflict('test_has_assignments');
  }
  run(
    'UPDATE tests SET status = ?, updated_at = ?, published_at = COALESCE(published_at, CASE WHEN ? = \'published\' THEN ? END) WHERE id = ?',
    status,
    now(),
    status,
    now(),
    t.id,
  );
  const action = { published: 'test.publish', archived: 'test.archive', completed: 'test.complete', draft: 'test.unpublish' }[status];
  audit(req, action, { entityType: 'test', entityId: t.id, metadata: { from: t.status, to: status, title: t.title } });
  res.json({ ok: true });
});

testsRouter.post('/:id/copy', requireRole('teacher', 'admin'), (req, res) => {
  const me = user(req);
  const t = loadTest(int(req.params.id));
  assertCanViewTest(me, t);
  if (me.role === 'teacher' && t.teacher_id !== me.id) throw forbidden();
  const qs = loadQuestions(t.id);
  const ts = now();
  const id = tx(() => {
    const { id } = run(
      `INSERT INTO tests (title, subject_id, teacher_id, topic, description, instruction, duration_min, attempts_limit, pass_score,
         shuffle_questions, shuffle_options, show_result, show_answers, multiple_scoring, status, created_at, updated_at)
       SELECT title || ' (копия)', subject_id, ?, topic, description, instruction, duration_min, attempts_limit, pass_score,
         shuffle_questions, shuffle_options, show_result, show_answers, multiple_scoring, 'draft', ?, ? FROM tests WHERE id = ?`,
      me.id,
      ts,
      ts,
      t.id,
    );
    replaceQuestions(
      id,
      qs.map((q) => ({
        type: q.type,
        text: q.text,
        imageUrl: q.image_url,
        explanation: q.explanation,
        score: q.score,
        options: q.options.map((o) => ({ text: o.text, isCorrect: !!o.is_correct })),
      })),
    );
    return id;
  });
  audit(req, 'test.copy', { entityType: 'test', entityId: id, metadata: { sourceId: t.id } });
  res.status(201).json({ id });
});

testsRouter.delete('/:id', (req, res) => {
  const me = user(req);
  const t = loadTest(int(req.params.id));
  assertCanEditTest(me, t);
  if (t.status !== 'draft' || testHasAttempts(t.id) || get('SELECT 1 FROM assignments WHERE test_id = ?', t.id)) {
    throw conflict('only_unused_drafts_deletable');
  }
  run('DELETE FROM tests WHERE id = ?', t.id);
  audit(req, 'test.delete', { entityType: 'test', entityId: t.id, metadata: { title: t.title } });
  res.json({ ok: true });
});

/* ---------- Question bank (questions across accessible tests) ---------- */

export const questionsRouter = Router();
questionsRouter.use(requireAuth);

questionsRouter.get('/', (req, res) => {
  const me = user(req);
  if (me.role === 'student') throw forbidden();
  const q = req.query as Record<string, string>;
  const w = new Where();
  if (!seesEverything(me)) w.add('t.teacher_id = ?', me.id);
  const search = qstr(q.search);
  if (search) w.add('LOWER(q.text) LIKE ?', `%${search.toLowerCase()}%`);
  if (q.subjectId) w.add('t.subject_id = ?', int(q.subjectId));
  if (q.type) w.add('q.type = ?', q.type);
  const rows = all(
    `SELECT q.id, q.text, q.type, q.score, q.position, t.id AS test_id, t.title AS test_title, t.topic, s.name AS subject_name,
       COUNT(sa.id) AS answers, SUM(CASE WHEN sa.is_correct = 1 THEN 1 ELSE 0 END) AS correct,
       ROUND(100.0 * SUM(CASE WHEN sa.is_correct = 1 THEN 1 ELSE 0 END) / NULLIF(COUNT(sa.id), 0), 1) AS correct_pct
     FROM questions q JOIN tests t ON t.id = q.test_id JOIN subjects s ON s.id = t.subject_id
     LEFT JOIN student_answers sa ON sa.question_id = q.id
       AND sa.attempt_id IN (SELECT id FROM attempts WHERE status = 'completed')
     ${w.sql} GROUP BY q.id ORDER BY t.updated_at DESC, q.position LIMIT 500`,
    ...w.params,
  );
  res.json(rows);
});

uploadsRouter.post('/image', requireRole('teacher', 'admin'), (req, res) => {
  const { data } = parse(z.object({ data: z.string().min(20).max(4_000_000) }), req.body);
  const url = saveImage(data);
  audit(req, 'file.upload', { entityType: 'file', entityId: url });
  res.status(201).json({ url });
});

