export type Role = 'student' | 'teacher' | 'admin' | 'auditor';
export const ROLES: Role[] = ['student', 'teacher', 'admin', 'auditor'];

export interface AuthUser {
  id: number;
  role: Role;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  status: string;
  avatar_url: string | null;
  language: string | null;
  has_password: number;
  requested_role: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      sessionId?: number;
    }
  }
}

export type QuestionType = 'single' | 'multiple' | 'yes_no' | 'true_false' | 'short_text';
export const QUESTION_TYPES: QuestionType[] = ['single', 'multiple', 'yes_no', 'true_false', 'short_text'];

export type TestStatus = 'draft' | 'published' | 'completed' | 'archived';
