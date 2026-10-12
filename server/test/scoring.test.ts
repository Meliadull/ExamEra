import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isAnswered, normalizeText, scoreAnswer, type ScoredQuestion } from '../src/services/scoring.js';

const single: ScoredQuestion = {
  type: 'single',
  score: 2,
  options: [
    { id: 1, text: '3', is_correct: 0 },
    { id: 2, text: '4', is_correct: 1 },
  ],
};
const multiple: ScoredQuestion = {
  type: 'multiple',
  score: 4,
  options: [
    { id: 1, text: 'a', is_correct: 1 },
    { id: 2, text: 'b', is_correct: 1 },
    { id: 3, text: 'c', is_correct: 0 },
    { id: 4, text: 'd', is_correct: 0 },
  ],
};
const short: ScoredQuestion = {
  type: 'short_text',
  score: 1,
  options: [
    { id: 1, text: 'Ташкент', is_correct: 1 },
    { id: 2, text: '0,5', is_correct: 1 },
    { id: 3, text: 'ёлка', is_correct: 1 },
  ],
};

describe('scoreAnswer', () => {
  it('single choice: right and wrong option', () => {
    assert.deepEqual(scoreAnswer(single, 2, 'strict'), { answered: true, isCorrect: true, score: 2 });
    assert.deepEqual(scoreAnswer(single, 1, 'strict'), { answered: true, isCorrect: false, score: 0 });
  });

  it('unanswered questions score nothing and are not "wrong"', () => {
    assert.deepEqual(scoreAnswer(single, null, 'strict'), { answered: false, isCorrect: false, score: 0 });
    assert.equal(scoreAnswer(multiple, [], 'partial').answered, false);
    assert.equal(scoreAnswer(short, '   ', 'strict').answered, false);
  });

  it('multiple choice, strict: only the exact set earns points', () => {
    assert.equal(scoreAnswer(multiple, [1, 2], 'strict').score, 4);
    assert.equal(scoreAnswer(multiple, [2, 1], 'strict').isCorrect, true);
    assert.equal(scoreAnswer(multiple, [1], 'strict').score, 0);
    assert.equal(scoreAnswer(multiple, [1, 2, 3], 'strict').score, 0);
  });

  it('multiple choice, partial: (right − wrong) / total right, never negative', () => {
    assert.equal(scoreAnswer(multiple, [1], 'partial').score, 2);
    assert.equal(scoreAnswer(multiple, [1, 3], 'partial').score, 0);
    assert.equal(scoreAnswer(multiple, [3, 4], 'partial').score, 0);
    assert.deepEqual(scoreAnswer(multiple, [1, 2], 'partial'), { answered: true, isCorrect: true, score: 4 });
  });

  it('short answer ignores case, extra spaces, ё/е and decimal comma', () => {
    assert.equal(scoreAnswer(short, '  ташкент ', 'strict').isCorrect, true);
    assert.equal(scoreAnswer(short, '0.5', 'strict').isCorrect, true);
    assert.equal(scoreAnswer(short, 'елка', 'strict').isCorrect, true);
    assert.equal(scoreAnswer(short, 'Самарканд', 'strict').isCorrect, false);
  });

  it('yes/no and true/false work like single choice', () => {
    const yn: ScoredQuestion = { type: 'yes_no', score: 1, options: [{ id: 7, text: 'yes', is_correct: 1 }, { id: 8, text: 'no', is_correct: 0 }] };
    assert.equal(scoreAnswer(yn, 7, 'strict').score, 1);
    assert.equal(scoreAnswer(yn, 8, 'strict').score, 0);
  });
});

describe('helpers', () => {
  it('normalizeText', () => {
    assert.equal(normalizeText('  Hello   World '), 'hello world');
    assert.equal(normalizeText('3,14'), '3.14');
  });
  it('isAnswered', () => {
    assert.equal(isAnswered('single', 0), true);
    assert.equal(isAnswered('single', null), false);
    assert.equal(isAnswered('multiple', [1]), true);
    assert.equal(isAnswered('short_text', ''), false);
  });
});
