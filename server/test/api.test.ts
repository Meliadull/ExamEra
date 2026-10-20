/*
 * End-to-end API tests: a real server process with a fresh, temporary demo database.
 * The user's own database is never touched.
 */
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'examera-test-'));
const PORT = 4500 + Math.floor(Math.random() * 400);
const BASE = `http://localhost:${PORT}/api`;
let proc: ChildProcess;

const PASSWORD = 'Demo1234';
const PHONES = { student: '+998901234567', teacher: '+998900000002', teacher2: '+998900000004', admin: '+998900000001', auditor: '+998900000003' };

async function call(method: string, url: string, opts: { cookie?: string; body?: unknown } = {}) {
  const res = await fetch(BASE + url, {
    method,
    headers: { ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(opts.cookie ? { cookie: opts.cookie } : {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data: any = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: res.status, data, cookie: res.headers.get('set-cookie')?.split(';')[0] };
}

const sessions: Record<string, string> = {};
async function login(who: keyof typeof PHONES) {
  if (!sessions[who]) {
    const r = await call('POST', '/auth/login', { body: { login: PHONES[who], password: PASSWORD } });
    assert.equal(r.status, 200, `login ${who}`);
    sessions[who] = r.cookie!;
  }
  return sessions[who];
}

before(async () => {
  proc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', '--import', 'tsx', 'src/index.ts'], {
    cwd: serverRoot,
    env: {
      ...process.env,
      API_PORT: String(PORT),
      DB_PATH: path.join(tmp, 'test.db'),
      BACKUP_DIR: path.join(tmp, 'backups'),
      UPLOADS_DIR: path.join(tmp, 'uploads'),
      SEED_DEMO: 'true',
      SMS_PROVIDER: 'console',
      NODE_ENV: 'test',
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(BASE + '/health')).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('server did not start');
});

after(() => {
  proc?.kill();
  setTimeout(() => fs.rmSync(tmp, { recursive: true, force: true }), 500).unref();
});

describe('authentication', () => {
  it('rejects a wrong password and accepts the right one', async () => {
    assert.equal((await call('POST', '/auth/login', { body: { login: PHONES.student, password: 'wrong-pass' } })).status, 401);
    const ok = await call('POST', '/auth/login', { body: { login: '+998 90 123 45 67', password: PASSWORD } });
    assert.equal(ok.status, 200);
    assert.equal(ok.data.user.role, 'student');
  });

  it('self-registration with an SMS code; a teacher request is not a role', async () => {
    const otp = await call('POST', '/auth/otp', { body: { phone: '+998 93 555 44 33', purpose: 'register' } });
    assert.equal(otp.status, 200);
    const reg = await call('POST', '/auth/register', {
      body: { phone: '+998935554433', firstName: 'Test', lastName: 'Teacher', password: 'Parol1234', code: otp.data.devCode, asTeacher: true },
    });
    assert.equal(reg.status, 201);
    assert.equal(reg.data.user.role, 'student');
    assert.equal(reg.data.user.requested_role, 'teacher');
    const again = await call('POST', '/auth/otp', { body: { phone: '+998935554433', purpose: 'register' } });
    assert.equal(again.status, 409);
  });

  it('administrators cannot create accounts (only self-registration)', async () => {
    const r = await call('POST', '/users', { cookie: await login('admin'), body: { firstName: 'A', lastName: 'B', phone: '+998931112233', role: 'teacher' } });
    assert.equal(r.status, 404);
  });
});

describe('permissions', () => {
  it('students cannot reach staff endpoints', async () => {
    assert.equal((await call('GET', '/tests', { cookie: await login('student') })).status, 403);
    assert.equal((await call('GET', '/users', { cookie: await login('student') })).status, 403);
  });

  it('the auditor is read-only', async () => {
    const r = await call('POST', '/groups', { cookie: await login('auditor'), body: { name: 'X', academicYear: '2026' } });
    assert.equal(r.status, 403);
    assert.equal(r.data.error, 'read_only_role');
    assert.equal((await call('GET', '/audit', { cookie: await login('auditor') })).status, 200);
  });

  it('teachers cannot manage subjects or group composition', async () => {
    const t = await login('teacher');
    assert.equal((await call('POST', '/subjects', { cookie: t, body: { name: 'Astronomy' } })).status, 403);
    assert.equal((await call('POST', '/groups/1/students', { cookie: t, body: { userIds: [5] } })).status, 403);
  });

  it('teachers create tests only for subjects assigned to them', async () => {
    const t = await login('teacher');
    const subjects = (await call('GET', '/subjects', { cookie: t })).data as any[];
    const mine = (await call('GET', '/subjects?mine=1', { cookie: t })).data as any[];
    const other = subjects.find((s) => !mine.some((m) => m.id === s.id))!;
    const denied = await call('POST', '/tests', { cookie: t, body: { title: 'x', subjectId: other.id } });
    assert.equal(denied.status, 403);
    assert.equal(denied.data.error, 'subject_not_assigned');
    const ok = await call('POST', '/tests', { cookie: t, body: { title: 'tmp', subjectId: mine[0].id } });
    assert.equal(ok.status, 201);
    assert.equal((await call('DELETE', `/tests/${ok.data.id}`, { cookie: t })).status, 200);
  });

  it('subject topics are edited by the subject teacher only', async () => {
    const t = await login('teacher');
    const mine = (await call('GET', '/subjects?mine=1', { cookie: t })).data as any[];
    assert.equal((await call('PUT', `/subjects/${mine[0].id}/topics`, { cookie: t, body: { topics: ['A', 'B'] } })).status, 200);
    assert.equal((await call('PUT', `/subjects/${mine[0].id}/topics`, { cookie: await login('admin'), body: { topics: ['X'] } })).status, 403);
    const all = (await call('GET', '/subjects', { cookie: t })).data as any[];
    const foreign = all.find((s) => !mine.some((m) => m.id === s.id))!;
    assert.equal((await call('PUT', `/subjects/${foreign.id}/topics`, { cookie: t, body: { topics: ['X'] } })).status, 403);
  });
});

describe('class leader', () => {
  it('sees the whole class, but only own tests in other groups', async () => {
    const t = await login('teacher');
    const groups = (await call('GET', '/groups', { cookie: t })).data as any[];
    const led = groups.find((g) => g.is_leader)!;
    const other = groups.find((g) => !g.is_leader)!;
    const full = (await call('GET', `/analytics/groups/${led.id}`, { cookie: t })).data;
    const own = (await call('GET', `/analytics/groups/${other.id}`, { cookie: t })).data;
    assert.equal(full.scope, 'full');
    assert.equal(own.scope, 'own');
    const me = (await call('GET', '/auth/me', { cookie: t })).data.user.id;
    assert.ok(full.tests.some((x: any) => x.teacher_id !== me), 'leader sees other teachers’ tests');
    assert.ok(own.tests.every((x: any) => x.teacher_id === me), 'non-leader sees only own tests');
    assert.equal((await call('GET', `/analytics/class/${led.id}`, { cookie: t })).status, 200);
    assert.equal((await call('GET', `/analytics/class/${other.id}`, { cookie: t })).status, 403);
  });
});

describe('taking a test', () => {
  it('start → answer → finish → result; no second attempt; correct answers never sent while running', async () => {
    const s = await login('student');
    const list = (await call('GET', '/student/tests', { cookie: s })).data as any[];
    assert.equal(new Set(list.map((a) => a.test_id)).size, list.length, 'one card per test');
    const target = list.find((a) => a.status === 'available' && !a.active_attempt_id)!;
    assert.ok(target, 'an available test exists');

    const start = await call('POST', '/attempts', { cookie: s, body: { assignmentId: target.id } });
    assert.equal(start.status, 201);
    const attempt = await call('GET', `/attempts/${start.data.id}`, { cookie: s });
    assert.ok(!JSON.stringify(attempt.data).includes('is_correct'));

    const answers = attempt.data.questions.map((q: any) => ({
      questionId: q.id,
      answer: q.type === 'short_text' ? 'x' : q.type === 'multiple' ? [q.options[0].id] : q.options[0].id,
    }));
    assert.equal((await call('PUT', `/attempts/${start.data.id}/answers`, { cookie: s, body: { answers } })).status, 200);
    assert.equal((await call('POST', `/attempts/${start.data.id}/finish`, { cookie: s, body: {} })).status, 200);

    const result = (await call('GET', `/attempts/${start.data.id}/result`, { cookie: s })).data;
    assert.equal(result.status, 'completed');
    assert.equal(typeof result.percentage, 'number');
    assert.equal(result.correct_count + result.wrong_count + result.skipped_count, attempt.data.questions.length);

    const again = await call('POST', '/attempts', { cookie: s, body: { assignmentId: target.id } });
    assert.equal(again.status, 409);
    assert.equal(again.data.error, 'no_attempts_left');
    const after = ((await call('GET', '/student/tests', { cookie: s })).data as any[]).find((a) => a.test_id === target.test_id);
    assert.equal(after.status, 'completed');
  });

  it('the same test cannot be assigned twice to a group while open', async () => {
    const t = await login('teacher');
    const tests = (await call('GET', '/tests?status=published', { cookie: t })).data as any[];
    const groups = (await call('GET', '/groups', { cookie: t })).data as any[];
    const now = Date.now();
    const body = {
      testId: tests[0].id,
      groupIds: [groups[groups.length - 1].id],
      userIds: [],
      startsAt: new Date(now).toISOString(),
      endsAt: new Date(now + 86400_000).toISOString(),
      durationMin: 10,
      attemptsLimit: 1,
      passScore: 60,
      showResult: true,
      showAnswers: false,
    };
    const first = await call('POST', '/assignments', { cookie: t, body });
    assert.ok([201, 409].includes(first.status));
    const second = await call('POST', '/assignments', { cookie: t, body });
    assert.equal(second.status, 409);
    assert.equal(second.data.error, 'already_assigned');
  });
});

describe('search & backups', () => {
  it('search is case-insensitive for Cyrillic', async () => {
    const a = await login('admin');
    for (const q of ['Каримова', 'каримова', 'КАРИМОВА']) {
      const r = await call('GET', `/users?search=${encodeURIComponent(q)}`, { cookie: a });
      assert.ok(r.data.total >= 1, q);
    }
  });

  it('assignment list filters by search, subject and teacher', async () => {
    const a = await login('admin');
    const all = (await call('GET', '/assignments', { cookie: a })).data as any[];
    assert.ok(all.length > 0);
    const sample = all[0];
    const bySearch = (await call('GET', `/assignments?search=${encodeURIComponent(sample.test_title.slice(0, 5).toUpperCase())}`, { cookie: a })).data as any[];
    assert.ok(bySearch.some((x) => x.id === sample.id));
    const bySubject = (await call('GET', `/assignments?subjectId=${(await call('GET', `/tests/${sample.test_id}`, { cookie: a })).data.subject_id}`, { cookie: a })).data as any[];
    assert.ok(bySubject.length && bySubject.every((x) => x.subject_name === sample.subject_name));
    const byTeacher = (await call('GET', `/assignments?teacherId=${sample.teacher_id}`, { cookie: a })).data as any[];
    assert.ok(byTeacher.length && byTeacher.every((x) => x.teacher_id === sample.teacher_id));
    assert.equal(((await call('GET', '/assignments?search=zzzz-nothing', { cookie: a })).data as any[]).length, 0);
  });

  it('admins create and list backups; others cannot', async () => {
    const a = await login('admin');
    const created = await call('POST', '/admin/backups', { cookie: a });
    assert.equal(created.status, 201);
    const list = (await call('GET', '/admin/backups', { cookie: a })).data as any[];
    assert.ok(list.some((b) => b.name === created.data.name));
    assert.equal((await call('GET', '/admin/backups', { cookie: await login('teacher') })).status, 403);
    assert.equal((await call('GET', '/admin/backups/..%2Ftest.db', { cookie: a })).status, 404);
  });

  it('demo quick-login lists only accounts that still use the demo password', async () => {
    const before = (await call('GET', '/auth/config')).data.demoAccounts as any[];
    assert.ok(before.some((d) => d.login === PHONES.teacher2));
    const t2 = await login('teacher2');
    assert.equal((await call('POST', '/auth/password', { cookie: t2, body: { current: PASSWORD, next: 'Another123' } })).status, 200);
    const afterList = (await call('GET', '/auth/config')).data.demoAccounts as any[];
    assert.ok(!afterList.some((d) => d.login === PHONES.teacher2));
  });
});
