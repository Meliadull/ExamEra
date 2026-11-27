/* Checks the bundled sample bank (server/content) without touching any real database. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

// The services open the database on import: point them at a throwaway file first.
process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'imtihonchisi-samples-')), 'samples.db');
const { checkSampleFile, readSampleFiles, toQuestions } = await import('../src/services/samples.js');

const files = readSampleFiles();

describe('sample bank content', () => {
  it('has content files', () => {
    assert.ok(files.length > 0);
  });

  for (const f of files) {
    it(`${f.key} from ${f.from ?? 1}: valid, 10 questions per topic`, () => {
      assert.deepEqual(checkSampleFile(f), []);
      for (const t of f.topics) assert.equal(t.q.length, 10, `${f.key}: "${t.t[0]}" has ${t.q.length} questions`);
    });
  }

  it('topics of each subject are numbered without gaps or overlaps, titles are unique', () => {
    const bySubject = new Map<string, { from: number; count: number; titles: string[]; name: string }[]>();
    for (const f of files) {
      const parts = bySubject.get(f.key) ?? [];
      parts.push({ from: f.from ?? 1, count: f.topics.length, titles: f.topics.map((t) => t.t[0]), name: f.name.join('/') });
      bySubject.set(f.key, parts);
    }
    for (const [key, parts] of bySubject) {
      parts.sort((a, b) => a.from - b.from);
      let next = 1;
      for (const p of parts) {
        assert.equal(p.from, next, `${key}: part starting at ${p.from}, expected ${next}`);
        next += p.count;
      }
      assert.equal(new Set(parts.map((p) => p.name)).size, 1, `${key}: subject name differs between parts`);
      const titles = parts.flatMap((p) => p.titles);
      assert.equal(new Set(titles).size, titles.length, `${key}: duplicate topic titles`);
    }
  });

  it('correct answers are spread over the options', () => {
    for (const f of files) {
      const positions = f.topics.flatMap((t) => toQuestions(t).filter((q) => q.type === 'single').map((q) => q.options.findIndex((o) => o.isCorrect)));
      const share = Math.max(...[0, 1, 2, 3].map((i) => positions.filter((p) => p === i).length)) / positions.length;
      assert.ok(share < 0.6, `${f.key}: ${Math.round(share * 100)}% of answers share one position`);
    }
  });
});
