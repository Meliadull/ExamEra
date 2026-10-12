export type Role = 'student' | 'teacher' | 'admin' | 'auditor';
export type QuestionType = 'single' | 'multiple' | 'yes_no' | 'true_false' | 'short_text';
export type TestStatus = 'draft' | 'published' | 'completed' | 'archived';

export interface User {
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

export interface AuthConfig {
  platformName: string;
  googleClientId: string | null;
  registrationEnabled: boolean;
  smsDevMode: boolean;
  minPasswordLength: number;
  defaultLanguage: string;
  demoAccounts: { role: string; login: string; name: string }[];
}

export interface Option {
  id: number;
  text: string;
  is_correct?: number | boolean;
}

export interface Question {
  id: number;
  type: QuestionType;
  text: string;
  image_url: string | null;
  explanation?: string;
  score: number;
  position?: number;
  options: Option[];
}

export interface Subject {
  id: number;
  name: string;
  description: string;
  topics: string[];
  test_count: number;
  teachers: string | null;
  groups: string | null;
  avg_percentage: number | null;
}

export interface Group {
  id: number;
  name: string;
  academic_year: string;
  status: string;
  student_count: number;
  teachers: string | null;
  subjects: string | null;
  avg_percentage: number | null;
}

export interface Kpis {
  attempts: number;
  students: number;
  tests: number;
  avg_percentage: number | null;
  avg_score: number | null;
  max_percentage: number | null;
  min_percentage: number | null;
  pass_rate: number | null;
  passed: number | null;
  failed: number | null;
  avg_duration_sec: number | null;
}

export interface Point {
  date: string;
  value: number;
}
