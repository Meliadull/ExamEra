/*
 * The bundled sample-test bank (server/content/*.json): one subject per file, one test per topic.
 * Loaded at start-up and re-synced when a file changes; teachers' own tests are never touched.
 *
 * File format (kept compact on purpose — the bank holds thousands of questions):
 *   { "key": "math", "from": 1, "name": ["Matematika", "Математика"], "aliases": ["алгебра"],
 *     "topics": [ { "t": ["Natural sonlar", "Натуральные числа"],
 *                   "q": [ ["Savol?", "Вопрос?", ["12", ["bir", "один"], …], 1], … ] } ] }
 * A text is either one string (same in both languages: numbers, formulas, words of a foreign language)
 * or a [uz, ru] pair. The last element of a question is the index of the correct option, or an array of
 * indexes for a question with several correct answers.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { serverRoot } from '../config.js';
import { all, get, now, run, tx } from '../db.js';
import { replaceQuestions, validateQuestion, type QuestionInput } from './tests.js';

type Text = string | [string, string];
type RawQuestion = [Text, Text, Text[], number | number[]] | [string, string, Text[], number | number[]];
interface RawTopic {
  t: [string, string];
  q: RawQuestion[];
}
export interface SampleFile {
  key: string;
  /** Number of the first topic in this file: a subject may be split into several part files. */
  from?: number;
  name: [string, string];
  aliases?: string[];
  topics: RawTopic[];
}

export const CONTENT_DIR = path.join(serverRoot, 'content');

const uz = (t: Text) => (Array.isArray(t) ? t[0] : t);
const ru = (t: Text) => (Array.isArray(t) ? t[1] : t);
/** Store a translation only when it differs from the original. */
const ruOrNull = (t: Text) => (Array.isArray(t) && t[1] !== t[0] ? t[1] : null);

export function toQuestions(topic: RawTopic): QuestionInput[] {
  return topic.q.map(([qUz, qRu, options, answer]) => {
    const correct = new Set(Array.isArray(answer) ? answer : [answer]);
    return {
      type: Array.isArray(answer) ? 'multiple' : 'single',
      text: uz(qUz as Text),
      textRu: ru(qRu as Text) !== uz(qUz as Text) ? ru(qRu as Text) : null,
      explanation: '',
      score: Array.isArray(answer) ? 2 : 1,
      options: options.map((o, i) => ({ text: uz(o), textRu: ruOrNull(o), isCorrect: correct.has(i) })),
    };
  });
}

/** Problems in a content file, as readable strings (empty when the file is valid). */
export function checkSampleFile(f: SampleFile): string[] {
  const problems: string[] = [];
  if (!f.key || !/^[a-z0-9-]+$/.test(f.key)) problems.push('bad key');
  if (f.from !== undefined && (!Number.isInteger(f.from) || f.from < 1)) problems.push('bad from');
  if (!Array.isArray(f.name) || f.name.length !== 2 || !f.name[0] || !f.name[1]) problems.push('bad name');
  if (!Array.isArray(f.topics) || !f.topics.length) problems.push('no topics');
  (f.topics ?? []).forEach((t, ti) => {
    const where = `topic ${(f.from ?? 1) + ti}`;
    if (!Array.isArray(t.t) || !t.t[0] || !t.t[1]) problems.push(`${where}: bad title`);
    if (!Array.isArray(t.q) || !t.q.length) return problems.push(`${where}: no questions`);
    t.q.forEach((q, qi) => {
      const at = `${where} q${qi + 1}`;
      if (!Array.isArray(q) || q.length !== 4) return problems.push(`${at}: expected [uz, ru, options, answer]`);
      const [, , options, answer] = q;
      if (!uz(q[0] as Text)?.trim() || !ru(q[1] as Text)?.trim()) problems.push(`${at}: empty text`);
      if (!Array.isArray(options) || options.length < 2) return problems.push(`${at}: needs options`);
      if (options.some((o) => !uz(o)?.toString().trim() || !ru(o)?.toString().trim())) problems.push(`${at}: empty option`);
      const idx = Array.isArray(answer) ? answer : [answer];
      if (!idx.length || idx.some((i) => !Number.isInteger(i) || i < 0 || i >= options.length)) problems.push(`${at}: bad answer`);
      if (new Set(options.map((o) => uz(o).trim().toLowerCase())).size !== options.length) problems.push(`${at}: duplicate options`);
    });
    for (const q of toQuestions(t)) {
      const errors = validateQuestion(q);
      if (errors.length) problems.push(`${where}: ${errors.join(',')}`);
    }
  });
  return problems;
}

export function readSampleFiles(): SampleFile[] {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  return fs
    .readdirSync(CONTENT_DIR)
    .filter((n) => n.endsWith('.json'))
    .sort()
    .map((n) => JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, n), 'utf8')) as SampleFile);
}

/** Finds the subject by any of its names (case-insensitively) or creates it. */
function ensureSubject(f: SampleFile): number {
  const names = [f.name[0], f.name[1], ...(f.aliases ?? [])].map((n) => n.toLowerCase());
  const found = get<{ id: number }>(
    `SELECT id FROM subjects WHERE lower(name) IN (${names.map(() => '?').join(',')})
       OR lower(COALESCE(name_uz, '')) = ? OR lower(COALESCE(name_ru, '')) = ? ORDER BY id LIMIT 1`,
    ...names,
    names[0],
    names[1],
  );
  const id =
    found?.id ??
    run('INSERT INTO subjects (name, description, topics, created_at) VALUES (?, ?, ?, ?)', f.name[0], '', '[]', now()).id;
  run('UPDATE subjects SET name_uz = COALESCE(name_uz, ?), name_ru = COALESCE(name_ru, ?) WHERE id = ?', f.name[0], f.name[1], id);
  // The bank's topics join the subject's own topic list (existing topics stay as they are).
  const current = JSON.parse(get<{ topics: string }>('SELECT topics FROM subjects WHERE id = ?', id)!.topics) as string[];
  const merged = [...current, ...f.topics.map((t) => t.t[0]).filter((t) => !current.includes(t))];
  if (merged.length !== current.length) run('UPDATE subjects SET topics = ? WHERE id = ?', JSON.stringify(merged), id);
  return id;
}

/** Loads or refreshes the bank. Returns the number of sample tests created or updated. */
export function syncSamples(files: SampleFile[] = readSampleFiles()): number {
  if (!files.length) return 0;
  // Samples need an owner; on a database without an administrator the bank waits for the next start.
  const owner = get<{ id: number }>("SELECT id FROM users WHERE role = 'admin' ORDER BY status = 'active' DESC, id LIMIT 1");
  if (!owner) return 0;
  let changed = 0;
  for (const f of files) {
    const problems = checkSampleFile(f);
    if (problems.length) {
      console.error(`Sample bank "${f.key}" skipped: ${problems.slice(0, 5).join('; ')}`);
      continue;
    }
    tx(() => {
      const subjectId = ensureSubject(f);
      const existing = new Map(
        all<{ id: number; sample_key: string; sample_hash: string }>(
          "SELECT id, sample_key, sample_hash FROM tests WHERE sample_key LIKE ? || ':%'",
          f.key,
        ).map((r) => [r.sample_key, r]),
      );
      f.topics.forEach((topic, i) => {
        const key = `${f.key}:${String((f.from ?? 1) + i).padStart(2, '0')}`;
        const hash = crypto.createHash('sha1').update(JSON.stringify(topic)).digest('hex');
        const row = existing.get(key);
        if (row?.sample_hash === hash) return;
        const ts = now();
        let id = row?.id;
        if (id) {
          run(
            'UPDATE tests SET title = ?, title_ru = ?, topic = ?, topic_ru = ?, subject_id = ?, sample_hash = ?, updated_at = ? WHERE id = ?',
            topic.t[0], topic.t[1], topic.t[0], topic.t[1], subjectId, hash, ts, id,
          );
        } else {
          id = run(
            `INSERT INTO tests (title, title_ru, subject_id, teacher_id, topic, topic_ru, description, instruction, duration_min,
               attempts_limit, pass_score, shuffle_questions, shuffle_options, show_result, show_answers, multiple_scoring, status,
               created_at, updated_at, published_at, is_sample, sample_key, sample_hash)
             VALUES (?, ?, ?, ?, ?, ?, '', '', 15, 1, 60, 0, 1, 1, 1, 'strict', 'published', ?, ?, ?, 1, ?, ?)`,
            topic.t[0], topic.t[1], subjectId, owner.id, topic.t[0], topic.t[1], ts, ts, ts, key, hash,
          ).id;
        }
        replaceQuestions(id, toQuestions(topic));
        changed++;
      });
    });
  }
  if (changed) console.log(`Sample bank: ${changed} test(s) loaded`);
  return changed;
}
