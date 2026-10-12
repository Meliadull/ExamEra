import { get } from '../db.js';
import { verifyPassword } from './auth.js';

/** Password of the demo accounts created by the seed. */
export const DEMO_PASSWORD = 'Demo1234';

/** Accounts created by the demo seed (login = phone). */
export const DEMO_ACCOUNTS: { role: string; phone: string }[] = [
  { role: 'student', phone: '+998901234567' },
  { role: 'teacher', phone: '+998900000002' },
  { role: 'teacher', phone: '+998900000004' },
  { role: 'admin', phone: '+998900000001' },
  { role: 'auditor', phone: '+998900000003' },
];

export interface DemoAccount {
  id: number;
  role: string;
  phone: string;
  name: string;
}

let cache: { at: number; list: DemoAccount[] } | null = null;
const TTL_MS = 30_000;

/** Active demo accounts whose password is still the public demo password (a security risk once deployed). */
export async function accountsWithDemoPassword(): Promise<DemoAccount[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.list;
  const list: DemoAccount[] = [];
  for (const d of DEMO_ACCOUNTS) {
    const u = get<{ id: number; role: string; first_name: string; last_name: string; password_hash: string | null }>(
      "SELECT id, role, first_name, last_name, password_hash FROM users WHERE phone = ? AND status = 'active'",
      d.phone,
    );
    if (u?.password_hash && (await verifyPassword(DEMO_PASSWORD, u.password_hash))) {
      list.push({ id: u.id, role: u.role, phone: d.phone, name: `${u.first_name} ${u.last_name}`.trim() });
    }
  }
  cache = { at: Date.now(), list };
  return list;
}

/** Call after any password change so the login page and alerts update immediately. */
export function forgetDemoPasswordCheck() {
  cache = null;
}
