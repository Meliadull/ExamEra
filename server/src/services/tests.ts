import { z } from 'zod';
import { all, get, inList, run, tx } from '../db.js';
import { badRequest } from '../http.js';
import { QUESTION_TYPES, type QuestionType } from '../types.js';

export const optionInput = z.object({
  text: z.string().trim().max(1000),
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

export function replaceQuestions(testId: number, questions: QuestionInput[]) {
  validateQuestions(questions);
  tx(() => {
    run('DELETE FROM questions WHERE test_id = ?', testId);
    questions.forEach((q, i) => {
      const { id } = run(
        'INSERT INTO questions (test_id, type, text, image_url, explanation, score, position) VALUES (?, ?, ?, ?, ?, ?, ?)',
        testId,
        q.type,
        q.text,
        q.imageUrl ?? null,
        q.explanation ?? '',
        q.score,
        i + 1,
      );
      q.options.forEach((o, j) =>
        run(
          'INSERT INTO answer_options (question_id, text, is_correct, position) VALUES (?, ?, ?, ?)',
          id,
          o.text,
          o.isCorrect,
          j + 1,
        ),
      );
    });
  });
}

export interface OptionRow {
  id: number;
  question_id: number;
  text: string;
  is_correct: number;
  position: number;
}

export interface QuestionRow {
  id: number;
  test_id: number;
  type: QuestionType;
  text: string;
  image_url: string | null;
  explanation: string;
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
