import { all, get } from '../db.js';
import { forbidden, notFound } from '../http.js';
import type { AuthUser } from '../types.js';

export interface TestRow {
  id: number;
  title: string;
  subject_id: number;
  teacher_id: number;
  topic: string;
  description: string;
  instruction: string;
  duration_min: number | null;
  attempts_limit: number;
  pass_score: number;
  shuffle_questions: number;
  shuffle_options: number;
  show_result: number;
  show_answers: number;
  multiple_scoring: 'strict' | 'partial';
  starts_at: string | null;
  ends_at: string | null;
  status: 'draft' | 'published' | 'completed' | 'archived';
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export const isAdmin = (u: AuthUser) => u.role === 'admin';
export const seesEverything = (u: AuthUser) => u.role === 'admin' || u.role === 'auditor';

export function teacherGroupIds(teacherId: number): number[] {
  return all<{ group_id: number }>('SELECT group_id FROM group_teachers WHERE user_id = ?', teacherId).map((r) => r.group_id);
}

export function loadTest(id: number): TestRow {
  const t = get<TestRow>('SELECT * FROM tests WHERE id = ?', id);
  if (!t) throw notFound('test_not_found');
  return t;
}

export function assertCanViewTest(u: AuthUser, t: TestRow) {
  if (seesEverything(u)) return;
  if (u.role === 'teacher' && t.teacher_id === u.id) return;
  throw forbidden();
}

export function assertCanEditTest(u: AuthUser, t: TestRow) {
  if (u.role === 'admin') return;
  if (u.role === 'teacher' && t.teacher_id === u.id) return;
  throw forbidden();
}

export function canManageGroup(u: AuthUser, groupId: number): boolean {
  if (u.role === 'admin') return true;
  if (u.role !== 'teacher') return false;
  return !!get('SELECT 1 FROM group_teachers WHERE group_id = ? AND user_id = ?', groupId, u.id);
}

export function canViewGroup(u: AuthUser, groupId: number): boolean {
  return seesEverything(u) || canManageGroup(u, groupId);
}

/** A teacher may see students of their groups and students who took their tests. */
export function canViewStudent(u: AuthUser, studentId: number): boolean {
  if (seesEverything(u) || u.id === studentId) return true;
  if (u.role !== 'teacher') return false;
  return !!get(
    `SELECT 1 FROM group_students gs JOIN group_teachers gt ON gt.group_id = gs.group_id
       WHERE gs.user_id = ? AND gt.user_id = ?
     UNION ALL
     SELECT 1 FROM attempts a JOIN tests t ON t.id = a.test_id WHERE a.user_id = ? AND t.teacher_id = ?
     LIMIT 1`,
    studentId,
    u.id,
    studentId,
    u.id,
  );
}

/** SQL fragment restricting rows aliased `t` (tests) and `at` (attempts) to the user's scope. */
export function attemptScope(u: AuthUser): { sql: string; params: unknown[] } {
  if (seesEverything(u)) return { sql: '1=1', params: [] };
  if (u.role === 'teacher') return { sql: 't.teacher_id = ?', params: [u.id] };
  return { sql: 'at.user_id = ?', params: [u.id] };
}
