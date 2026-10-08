import { Router } from 'express';
import { all, get } from '../db.js';
import { badRequest, forbidden, int, notFound, paging, requireAuth, requireRole, user } from '../http.js';
import { assertCanViewTest, canViewGroup, canViewStudent, loadTest } from '../services/access.js';
import { ATTEMPT_FROM, attemptWhere, kpis, readFilters } from '../services/analytics.js';
import { audit } from '../services/audit.js';
import { COLS, fmtDate, fmtDuration, passedLabel, sendTable, type Lang } from '../services/export.js';

export const resultsRouter = Router();
export const reportsRouter = Router();
resultsRouter.use(requireAuth, requireRole('teacher', 'admin', 'auditor'));
reportsRouter.use(requireAuth, requireRole('teacher', 'admin', 'auditor'));

const RESULT_SELECT = `SELECT at.id, at.user_id, u.first_name, u.last_name, t.id AS test_id, t.title, s.name AS subject_name,
  at.score, at.max_score, at.percentage, at.correct_count, at.wrong_count, at.skipped_count, at.passed,
  at.duration_sec, at.completed_at, at.finish_reason,
  COALESCE(g.name, (SELECT GROUP_CONCAT(g2.name, ', ') FROM group_students gs2 JOIN study_groups g2 ON g2.id = gs2.group_id WHERE gs2.user_id = at.user_id)) AS group_name`;

resultsRouter.get('/', (req, res) => {
  const me = user(req);
  const q = req.query as Record<string, unknown>;
  const w = attemptWhere(me, readFilters(q));
  const { page, pageSize, offset } = paging(q, 25);
  const total = get<{ c: number }>(`SELECT COUNT(*) AS c ${ATTEMPT_FROM} ${w.sql}`, ...w.params)!.c;
  const sort = q.sort === 'percentage' ? 'at.percentage DESC' : q.sort === 'student' ? 'u.last_name, u.first_name' : 'at.completed_at DESC';
  const items = all(`${RESULT_SELECT} ${ATTEMPT_FROM} ${w.sql} ORDER BY ${sort} LIMIT ? OFFSET ?`, ...w.params, pageSize, offset);
  res.json({ total, page, pageSize, items, summary: kpis(w) });
});

function toRow(r: any, lang: Lang) {
  return {
    test: r.title,
    subject: r.subject_name,
    group: r.group_name ?? '',
    student: `${r.last_name} ${r.first_name}`,
    score: r.score,
    maxScore: r.max_score,
    percentage: r.percentage,
    correct: r.correct_count,
    wrong: r.wrong_count,
    skipped: r.skipped_count,
    passed: passedLabel(r.passed, lang),
    date: fmtDate(r.completed_at),
    duration: fmtDuration(r.duration_sec),
  };
}

const FULL_COLUMNS = [
  COLS.test,
  COLS.subject,
  COLS.group,
  COLS.student,
  COLS.score,
  COLS.maxScore,
  COLS.percentage,
  COLS.correct,
  COLS.wrong,
  COLS.skipped,
  COLS.passed,
  COLS.date,
  COLS.duration,
];

function fmt(q: Record<string, unknown>) {
  const format = String(q.format ?? 'xlsx');
  if (!['xlsx', 'csv'].includes(format)) throw badRequest('unsupported_format');
  const lang: Lang = q.lang === 'uz' ? 'uz' : 'ru';
  return { format, lang };
}

/** Results list export honoring the same filters as the results page. */
reportsRouter.get('/results', async (req, res) => {
  const me = user(req);
  const q = req.query as Record<string, unknown>;
  const { format, lang } = fmt(q);
  const w = attemptWhere(me, readFilters(q));
  const rows = all(`${RESULT_SELECT} ${ATTEMPT_FROM} ${w.sql} ORDER BY at.completed_at DESC LIMIT 50000`, ...w.params);
  audit(req, 'data.export', { entityType: 'report', entityId: 'results', metadata: { format, rows: rows.length, filters: q } });
  await sendTable(res, {
    format,
    lang,
    filename: 'examera-results',
    title: [lang === 'uz' ? 'Natijalar' : 'Результаты тестирования', fmtDate(new Date().toISOString())],
    columns: FULL_COLUMNS,
    rows: rows.map((r) => toRow(r, lang)),
  });
});

reportsRouter.get('/test/:id', async (req, res) => {
  const me = user(req);
  const test = loadTest(int(req.params.id));
  assertCanViewTest(me, test);
  const { format, lang } = fmt(req.query as Record<string, unknown>);
  const w = attemptWhere(me, { ...readFilters(req.query as Record<string, unknown>), testId: test.id });
  const rows = all(`${RESULT_SELECT} ${ATTEMPT_FROM} ${w.sql} ORDER BY u.last_name, u.first_name`, ...w.params);
  const k = kpis(w);
  const subject = get<{ name: string }>('SELECT name FROM subjects WHERE id = ?', test.subject_id)!;
  audit(req, 'data.export', { entityType: 'test', entityId: test.id, metadata: { format, report: 'test', rows: rows.length } });
  await sendTable(res, {
    format,
    lang,
    filename: `test-${test.id}-report`,
    title: [
      test.title,
      `${lang === 'uz' ? 'Fan' : 'Предмет'}: ${subject.name}`,
      `${lang === 'uz' ? "O'rtacha natija" : 'Средний результат'}: ${k.avg_percentage ?? 0}%  ·  ${lang === 'uz' ? 'Ishtirokchilar' : 'Участников'}: ${k.students}`,
    ],
    columns: FULL_COLUMNS,
    rows: rows.map((r) => toRow(r, lang)),
  });
});

reportsRouter.get('/student/:id', async (req, res) => {
  const me = user(req);
  const sid = int(req.params.id);
  if (!canViewStudent(me, sid)) throw forbidden();
  const st = get<any>('SELECT first_name, last_name FROM users WHERE id = ?', sid);
  if (!st) throw notFound();
  const { format, lang } = fmt(req.query as Record<string, unknown>);
  const w = attemptWhere(me, { ...readFilters(req.query as Record<string, unknown>), studentId: sid });
  const rows = all(`${RESULT_SELECT} ${ATTEMPT_FROM} ${w.sql} ORDER BY at.completed_at DESC`, ...w.params);
  const k = kpis(w);
  audit(req, 'data.export', { entityType: 'user', entityId: sid, metadata: { format, report: 'student', rows: rows.length } });
  await sendTable(res, {
    format,
    lang,
    filename: `student-${sid}-report`,
    title: [`${st.last_name} ${st.first_name}`, `${lang === 'uz' ? "O'rtacha natija" : 'Средний результат'}: ${k.avg_percentage ?? 0}%`],
    columns: FULL_COLUMNS,
    rows: rows.map((r) => toRow(r, lang)),
  });
});

reportsRouter.get('/group/:id', async (req, res) => {
  const me = user(req);
  const gid = int(req.params.id);
  if (!canViewGroup(me, gid)) throw forbidden();
  const g = get<any>('SELECT name, academic_year FROM study_groups WHERE id = ?', gid);
  if (!g) throw notFound();
  const { format, lang } = fmt(req.query as Record<string, unknown>);
  const w = attemptWhere(me, { ...readFilters(req.query as Record<string, unknown>), groupId: gid });
  const rows = all(`${RESULT_SELECT} ${ATTEMPT_FROM} ${w.sql} ORDER BY t.title, u.last_name`, ...w.params);
  const k = kpis(w);
  audit(req, 'data.export', { entityType: 'group', entityId: gid, metadata: { format, report: 'group', rows: rows.length } });
  await sendTable(res, {
    format,
    lang,
    filename: `group-${gid}-report`,
    title: [
      `${g.name} (${g.academic_year})`,
      `${lang === 'uz' ? "O'rtacha natija" : 'Средний результат'}: ${k.avg_percentage ?? 0}%  ·  ${lang === 'uz' ? "O'tdi" : 'Сдали'}: ${k.passed ?? 0}  ·  ${lang === 'uz' ? "O'tmadi" : 'Не сдали'}: ${k.failed ?? 0}`,
    ],
    columns: FULL_COLUMNS,
    rows: rows.map((r) => toRow(r, lang)),
  });
});

reportsRouter.get('/summary', requireRole('admin', 'auditor'), async (req, res) => {
  const { format, lang } = fmt(req.query as Record<string, unknown>);
  const rows = all<any>(
    `SELECT s.name AS subject, COUNT(DISTINCT t.id) AS tests, COUNT(at.id) AS attempts, COUNT(DISTINCT at.user_id) AS students,
       ROUND(AVG(at.percentage), 1) AS avg, SUM(at.passed) AS passed
     FROM subjects s LEFT JOIN tests t ON t.subject_id = s.id
     LEFT JOIN attempts at ON at.test_id = t.id AND at.status = 'completed'
     GROUP BY s.id ORDER BY s.name`,
  );
  audit(req, 'data.export', { entityType: 'report', entityId: 'summary', metadata: { format } });
  const L = (ru: string, uz: string) => ({ ru, uz });
  await sendTable(res, {
    format,
    lang,
    filename: 'examera-summary',
    title: [lang === 'uz' ? 'Umumiy hisobot' : 'Сводный административный отчёт', fmtDate(new Date().toISOString())],
    columns: [
      { key: 'subject', ...L('Предмет', 'Fan'), width: 22 },
      { key: 'tests', ...L('Тестов', 'Testlar'), width: 10 },
      { key: 'attempts', ...L('Попыток', 'Urinishlar'), width: 10 },
      { key: 'students', ...L('Учащихся', "O'quvchilar"), width: 11 },
      { key: 'avg', ...L('Средний %', "O'rtacha %"), width: 11 },
      { key: 'passed', ...L('Сдали', "O'tdi"), width: 10 },
    ],
    rows,
  });
});
