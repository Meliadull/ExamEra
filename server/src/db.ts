import fs from 'node:fs';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { config } from './config.js';

fs.mkdirSync(config.uploadsDir, { recursive: true });

export const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

const cache = new Map<string, StatementSync>();
function stmt(sql: string): StatementSync {
  let s = cache.get(sql);
  if (!s) {
    if (cache.size > 500) cache.clear();
    s = db.prepare(sql);
    cache.set(sql, s);
  }
  return s;
}

function norm(params: unknown[]): any[] {
  return params.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));
}

export function all<T = any>(sql: string, ...params: unknown[]): T[] {
  return stmt(sql).all(...norm(params)) as T[];
}

export function get<T = any>(sql: string, ...params: unknown[]): T | undefined {
  return stmt(sql).get(...norm(params)) as T | undefined;
}

export function run(sql: string, ...params: unknown[]) {
  const r = stmt(sql).run(...norm(params));
  return { changes: Number(r.changes), id: Number(r.lastInsertRowid) };
}

let depth = 0;
export function tx<T>(fn: () => T): T {
  if (depth > 0) return fn();
  depth++;
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    depth--;
  }
}

export const now = () => new Date().toISOString();

/** Builds "?,?,?" for IN lists; an empty list yields a placeholder that matches nothing. */
export function inList(ids: unknown[]): string {
  return ids.length ? ids.map(() => '?').join(',') : 'NULL';
}

export class Where {
  parts: string[] = [];
  params: unknown[] = [];
  add(sql: string, ...params: unknown[]) {
    this.parts.push(sql);
    this.params.push(...params);
    return this;
  }
  get sql() {
    return this.parts.length ? 'WHERE ' + this.parts.join(' AND ') : '';
  }
}

const SCHEMA_V1 = `
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL DEFAULT '',
  phone TEXT UNIQUE,
  email TEXT UNIQUE,
  google_id TEXT UNIQUE,
  password_hash TEXT,
  role TEXT NOT NULL CHECK (role IN ('student','teacher','admin','auditor')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked','archived')),
  avatar_url TEXT,
  language TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  revoked_at TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE otp_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  purpose TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX idx_otp_phone ON otp_codes(phone, purpose);

CREATE TABLE academic_periods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE study_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  academic_year TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TEXT NOT NULL,
  UNIQUE(name, academic_year)
);

CREATE TABLE subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  topics TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE group_students (
  group_id INTEGER NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX idx_group_students_user ON group_students(user_id);

CREATE TABLE group_teachers (
  group_id INTEGER NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE group_subjects (
  group_id INTEGER NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, subject_id)
);

CREATE TABLE subject_teachers (
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  PRIMARY KEY (subject_id, user_id)
);

CREATE TABLE tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  subject_id INTEGER NOT NULL REFERENCES subjects(id),
  teacher_id INTEGER NOT NULL REFERENCES users(id),
  topic TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  instruction TEXT NOT NULL DEFAULT '',
  duration_min INTEGER,
  attempts_limit INTEGER NOT NULL DEFAULT 1,
  pass_score INTEGER NOT NULL DEFAULT 60,
  shuffle_questions INTEGER NOT NULL DEFAULT 0,
  shuffle_options INTEGER NOT NULL DEFAULT 0,
  show_result INTEGER NOT NULL DEFAULT 1,
  show_answers INTEGER NOT NULL DEFAULT 0,
  multiple_scoring TEXT NOT NULL DEFAULT 'strict' CHECK (multiple_scoring IN ('strict','partial')),
  starts_at TEXT,
  ends_at TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','completed','archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT
);
CREATE INDEX idx_tests_teacher ON tests(teacher_id);

CREATE TABLE questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('single','multiple','yes_no','true_false','short_text')),
  text TEXT NOT NULL,
  image_url TEXT,
  explanation TEXT NOT NULL DEFAULT '',
  score REAL NOT NULL DEFAULT 1,
  position INTEGER NOT NULL
);
CREATE INDEX idx_questions_test ON questions(test_id);

CREATE TABLE answer_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  is_correct INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL
);
CREATE INDEX idx_options_question ON answer_options(question_id);

CREATE TABLE assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id INTEGER NOT NULL REFERENCES tests(id),
  group_id INTEGER REFERENCES study_groups(id),
  user_id INTEGER REFERENCES users(id),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  duration_min INTEGER,
  attempts_limit INTEGER NOT NULL DEFAULT 1,
  pass_score INTEGER NOT NULL DEFAULT 60,
  show_result INTEGER NOT NULL DEFAULT 1,
  show_answers INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  reminded_at TEXT,
  CHECK (group_id IS NOT NULL OR user_id IS NOT NULL)
);
CREATE INDEX idx_assignments_test ON assignments(test_id);
CREATE INDEX idx_assignments_group ON assignments(group_id);
CREATE INDEX idx_assignments_user ON assignments(user_id);

CREATE TABLE attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id INTEGER NOT NULL REFERENCES assignments(id),
  test_id INTEGER NOT NULL REFERENCES tests(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed')),
  started_at TEXT NOT NULL,
  deadline_at TEXT NOT NULL,
  completed_at TEXT,
  score REAL,
  max_score REAL,
  percentage REAL,
  correct_count INTEGER,
  wrong_count INTEGER,
  skipped_count INTEGER,
  duration_sec INTEGER,
  passed INTEGER,
  finish_reason TEXT,
  question_order TEXT NOT NULL,
  option_order TEXT NOT NULL DEFAULT '{}',
  ip TEXT
);
CREATE INDEX idx_attempts_user ON attempts(user_id);
CREATE INDEX idx_attempts_test ON attempts(test_id);
CREATE INDEX idx_attempts_assignment ON attempts(assignment_id);
CREATE INDEX idx_attempts_status ON attempts(status, deadline_at);

CREATE TABLE student_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id),
  answer TEXT,
  flagged INTEGER NOT NULL DEFAULT 0,
  is_correct INTEGER,
  score REAL,
  updated_at TEXT NOT NULL,
  UNIQUE (attempt_id, question_id)
);
CREATE INDEX idx_answers_question ON student_answers(question_id);

CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  params TEXT NOT NULL DEFAULT '{}',
  link TEXT,
  ref TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_notifications_user ON notifications(user_id, read_at);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  user_id INTEGER,
  user_name TEXT,
  role TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  result TEXT NOT NULL DEFAULT 'success',
  ip TEXT,
  user_agent TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_audit_created ON audit_log(created_at);
CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export const DEFAULT_SETTINGS: Record<string, string> = {
  platform_name: 'ExamEra',
  registration_enabled: '1',
  google_auth_enabled: '1',
  default_language: 'ru',
  min_password_length: '8',
  default_pass_score: '60',
  session_days: '30',
  show_rating: '1',
};

export function migrate() {
  const { user_version } = get<{ user_version: number }>('PRAGMA user_version')!;
  if (user_version < 1) {
    db.exec(SCHEMA_V1);
    db.exec('PRAGMA user_version = 1');
  }
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', key, value);
  }
}

export function getSetting(key: string): string {
  return get<{ value: string }>('SELECT value FROM settings WHERE key = ?', key)?.value ?? DEFAULT_SETTINGS[key] ?? '';
}

export function getSettings(): Record<string, string> {
  const rows = all<{ key: string; value: string }>('SELECT key, value FROM settings');
  return { ...DEFAULT_SETTINGS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) };
}
