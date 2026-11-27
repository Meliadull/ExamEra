import { z } from 'zod';
import { all, get, inList, run, tx } from '../db.js';
import { badRequest } from '../http.js';
import { QUESTION_TYPES, type QuestionType } from '../types.js';

const ruText = (max: number) => z.string().trim().max(max).nullable().optional();

export const optionInput = z.object({
  text: z.string().trim().max(1000),
  /** Optional Russian translation of the option. */
  textRu: ruText(1000),
  isCorrect: z.boolean(),
});

export const questionInput = z.object({
  type: z.enum(QUESTION_TYPES as [QuestionType, ...QuestionType[]]),
  text: z.string().trim().min(1).max(5000),
  imageUrl: z
    .string()
    .regex(/^\/uploads\/[a-f0-9]{32}\.(png|jpg|gif|webp)$/)
    .nullable()
    .optional(),
  explanation: z.string().trim().max(5000).optional().default(''),
  /** Optional Russian translations; the main fields hold the original text. */
  textRu: ruText(5000),
  explanationRu: ruText(5000),
  score: z.number().positive().max(100),
  options: z.array(optionInput).max(12).default([]),
});
export type QuestionInput = z.infer<typeof questionInput>;

const BOOL_TOKENS: Record<string, [string, string]> = { yes_no: ['yes', 'no'], true_false: ['true', 'false'] };

/** Returns a list of human-readable error codes for a question (empty when valid) and normalizes binary types. */
export function validateQuestion(q: QuestionInput): string[] {
  const errors: string[] = [];
  if (q.type in BOOL_TOKENS) {
    const correctIdx = q.options.findIndex((o) => o.isCorrect);
    if (correctIdx < 0 || correctIdx > 1) errors.push('need_one_correct');
    q.options = BOOL_TOKENS[q.type].map((text, i) => ({ text, isCorrect: i === correctIdx }));
    return errors;
  }
  q.options = q.options.filter((o) => o.text.length > 0);
  const correct = q.options.filter((o) => o.isCorrect).length;
  if (q.type === 'short_text') {
    if (q.options.length < 1) errors.push('need_accepted_answer');
    q.options = q.options.map((o) => ({ ...o, isCorrect: true }));
    return errors;
  }
  if (q.options.length < 2) errors.push('need_two_options');
  if (q.type === 'single' && correct !== 1) errors.push('need_one_correct');
  if (q.type === 'multiple' && correct < 1) errors.push('need_correct');
  return errors;
}

export function validateQuestions(questions: QuestionInput[]) {
  const problems = questions
    .map((q, i) => ({ index: i, errors: validateQuestion(q) }))
    .filter((p) => p.errors.length);
  if (problems.length) throw badRequest('invalid_questions', problems);
}

/**
 * Translations the caller did not send are carried over from the current questions when the original text is
 * unchanged (the builder edits only the original language); edited text drops its now-stale translation.
 */
function keepTranslations(testId: number, questions: QuestionInput[]) {
  const old = loadQuestions(testId);
  if (!old.some((q) => q.text_ru || q.options.some((o) => o.text_ru))) return;
  for (const q of questions) {
    const prev = old.find((o) => o.text === q.text);
    if (!prev) continue;
    if (q.textRu === undefined) q.textRu = prev.text_ru;
    if (q.explanationRu === undefined && prev.explanation === (q.explanation ?? '')) q.explanationRu = prev.explanation_ru;
    for (const o of q.options) {
      if (o.textRu === undefined) o.textRu = prev.options.find((po) => po.text === o.text)?.text_ru ?? null;
    }
  }
}

export function replaceQuestions(testId: number, questions: QuestionInput[]) {
  validateQuestions(questions);
  tx(() => {
    keepTranslations(testId, questions);
    run('DELETE FROM questions WHERE test_id = ?', testId);
    questions.forEach((q, i) => {
      const { id } = run(
        'INSERT INTO questions (test_id, type, text, text_ru, image_url, explanation, explanation_ru, score, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        testId,
        q.type,
        q.text,
        q.textRu || null,
        q.imageUrl ?? null,
        q.explanation ?? '',
        q.explanationRu || null,
        q.score,
        i + 1,
      );
      q.options.forEach((o, j) =>
        run(
          'INSERT INTO answer_options (question_id, text, text_ru, is_correct, position) VALUES (?, ?, ?, ?, ?)',
          id,
          o.text,
          o.textRu || null,
          o.isCorrect,
          j + 1,
        ),
      );
    });
  });
}

/** Questions in the shape replaceQuestions accepts, translations included (used when copying a test). */
export function questionsForCopy(testId: number): QuestionInput[] {
  return loadQuestions(testId).map((q) => ({
    type: q.type,
    text: q.text,
    textRu: q.text_ru,
    imageUrl: q.image_url,
    explanation: q.explanation,
    explanationRu: q.explanation_ru,
    score: q.score,
    options: q.options.map((o) => ({ text: o.text, textRu: o.text_ru, isCorrect: !!o.is_correct })),
  }));
}

export interface OptionRow {
  id: number;
  question_id: number;
  text: string;
  text_ru: string | null;
  is_correct: number;
  position: number;
}

export interface QuestionRow {
  id: number;
  test_id: number;
  type: QuestionType;
  text: string;
  text_ru: string | null;
  image_url: string | null;
  explanation: string;
  explanation_ru: string | null;
  score: number;
  position: number;
  options: OptionRow[];
}

export function loadQuestions(testId: number): QuestionRow[] {
  const qs = all<Omit<QuestionRow, 'options'>>('SELECT * FROM questions WHERE test_id = ? ORDER BY position', testId);
  const opts = all<OptionRow>(
    `SELECT * FROM answer_options WHERE question_id IN (${inList(qs.map((q) => q.id))}) ORDER BY position`,
    ...qs.map((q) => q.id),
  );
  return qs.map((q) => ({ ...q, options: opts.filter((o) => o.question_id === q.id) }));
}

export function testHasAttempts(testId: number) {
  return !!get('SELECT 1 FROM attempts WHERE test_id = ? LIMIT 1', testId);
}
