import type { QuestionType } from '../types.js';

export interface ScoredOption {
  id: number;
  text: string;
  is_correct: number;
}

export interface ScoredQuestion {
  type: QuestionType;
  score: number;
  options: ScoredOption[];
}

export interface AnswerScore {
  answered: boolean;
  isCorrect: boolean;
  score: number;
}

export function normalizeText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/ё/g, 'е').replace(/(\d),(\d)/g, '$1.$2');
}

export function isAnswered(type: QuestionType, answer: unknown): boolean {
  if (answer === null || answer === undefined) return false;
  if (type === 'multiple') return Array.isArray(answer) && answer.length > 0;
  if (type === 'short_text') return typeof answer === 'string' && answer.trim().length > 0;
  return typeof answer === 'number';
}

/**
 * single / yes_no / true_false: answer is an option id.
 * multiple: answer is an array of option ids. "strict" requires the exact set;
 *   "partial" gives score × max(0, (right − wrong) / totalRight).
 * short_text: answer is a string matched against any accepted variant (options).
 */
export function scoreAnswer(q: ScoredQuestion, answer: unknown, mode: 'strict' | 'partial'): AnswerScore {
  if (!isAnswered(q.type, answer)) return { answered: false, isCorrect: false, score: 0 };
  const correctIds = new Set(q.options.filter((o) => o.is_correct).map((o) => o.id));

  if (q.type === 'short_text') {
    const given = normalizeText(String(answer));
    const ok = q.options.some((o) => normalizeText(o.text) === given);
    return { answered: true, isCorrect: ok, score: ok ? q.score : 0 };
  }

  if (q.type === 'multiple') {
    const chosen = new Set((answer as unknown[]).map(Number));
    const right = [...chosen].filter((id) => correctIds.has(id)).length;
    const wrong = chosen.size - right;
    const exact = wrong === 0 && right === correctIds.size;
    if (mode === 'strict' || exact) return { answered: true, isCorrect: exact, score: exact ? q.score : 0 };
    const ratio = Math.max(0, (right - wrong) / Math.max(1, correctIds.size));
    return { answered: true, isCorrect: false, score: Math.round(q.score * ratio * 100) / 100 };
  }

  const ok = correctIds.has(Number(answer));
  return { answered: true, isCorrect: ok, score: ok ? q.score : 0 };
}
