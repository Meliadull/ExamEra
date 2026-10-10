import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';
import { get, getSetting, now, run } from '../db.js';
import { badRequest, HttpError } from '../http.js';
import type { AuthUser } from '../types.js';

export const SESSION_COOKIE = 'ee_session';

function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) {
    // Spend comparable time so that missing accounts are not distinguishable by timing.
    await scrypt(password, crypto.randomBytes(16));
    return false;
  }
  const [scheme, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'));
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export function checkPasswordPolicy(password: string) {
  const min = Number(getSetting('min_password_length')) || 8;
  if (password.length < min) throw badRequest('password_too_short', { min });
  if (password.length > 128) throw badRequest('password_too_long');
  if (!/[A-Za-zА-Яа-яЁё]/.test(password) || !/\d/.test(password)) throw badRequest('password_too_weak');
}

export function generateTempPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const bytes = crypto.randomBytes(10);
  let s = '';
  for (let i = 0; i < 8; i++) s += alphabet[bytes[i] % alphabet.length];
  return s + digits[bytes[8] % digits.length] + digits[bytes[9] % digits.length];
}

export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  const full = digits.length === 9 ? '998' + digits : digits;
  if (full.length < 10 || full.length > 15) return null;
  return '+' + full;
}

const USER_FIELDS = `u.id, u.role, u.first_name, u.last_name, u.phone, u.email, u.status, u.avatar_url, u.language,
  (u.password_hash IS NOT NULL) AS has_password, u.requested_role`;

export function loadAuthUser(id: number): AuthUser | undefined {
  return get<AuthUser>(`SELECT ${USER_FIELDS} FROM users u WHERE u.id = ?`, id);
}

export function createSession(req: Request, res: Response, userId: number, remember: boolean) {
  const token = crypto.randomBytes(32).toString('base64url');
  const days = Number(getSetting('session_days')) || 30;
  const ttlMs = remember ? days * 86400_000 : 12 * 3600_000;
  const t = now();
  run(
    `INSERT INTO sessions (user_id, token_hash, created_at, expires_at, last_seen_at, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    userId,
    sha256(token),
    t,
    new Date(Date.now() + ttlMs).toISOString(),
    t,
    req.ip ?? null,
    req.get('user-agent')?.slice(0, 300) ?? null,
  );
  run('UPDATE users SET last_login_at = ? WHERE id = ?', t, userId);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    path: '/',
    ...(remember ? { maxAge: ttlMs } : {}),
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

export function revokeUserSessions(userId: number, exceptSessionId?: number) {
  run(
    'UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND id != ?',
    now(),
    userId,
    exceptSessionId ?? -1,
  );
}

/** Resolves the session cookie into req.user. Does not reject anonymous requests. */
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token || typeof token !== 'string') return next();
  const s = get<{ id: number; user_id: number; expires_at: string; last_seen_at: string }>(
    'SELECT id, user_id, expires_at, last_seen_at FROM sessions WHERE token_hash = ? AND revoked_at IS NULL',
    sha256(token),
  );
  if (!s || s.expires_at < now()) {
    clearSessionCookie(res);
    return next();
  }
  const u = loadAuthUser(s.user_id);
  if (!u || u.status !== 'active') {
    clearSessionCookie(res);
    return next();
  }
  if (Date.now() - Date.parse(s.last_seen_at) > 60_000) {
    run('UPDATE sessions SET last_seen_at = ? WHERE id = ?', now(), s.id);
  }
  req.user = u;
  req.sessionId = s.id;
  next();
}

const AUDITOR_WRITE_ALLOW = [/^\/auth\//, /^\/profile/, /^\/notifications/];

/** Server-side enforcement of the read-only auditor role. */
export function auditorReadOnly(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role === 'auditor' && req.method !== 'GET' && !AUDITOR_WRITE_ALLOW.some((r) => r.test(req.path))) {
    return next(new HttpError(403, 'read_only_role'));
  }
  next();
}

/** In-memory brute-force guard for login identifiers. */
const failures = new Map<string, { count: number; until: number }>();
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60_000;

export function assertNotLocked(key: string) {
  const f = failures.get(key);
  if (f && f.until > Date.now()) {
    throw new HttpError(429, 'too_many_attempts', { retryAfterSec: Math.ceil((f.until - Date.now()) / 1000) });
  }
}

export function registerFailure(key: string) {
  const f = failures.get(key);
  const count = (f && f.until <= Date.now() && f.count >= MAX_FAILURES ? 0 : f?.count ?? 0) + 1;
  failures.set(key, { count, until: count >= MAX_FAILURES ? Date.now() + LOCK_MS : 0 });
}

export function clearFailures(key: string) {
  failures.delete(key);
}

export interface GoogleProfile {
  googleId: string;
  email: string;
  firstName: string;
  lastName: string;
  picture: string | null;
}

export async function verifyGoogleCredential(credential: string): Promise<GoogleProfile> {
  if (!config.googleClientId) throw new HttpError(503, 'google_not_configured');
  const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential));
  if (!r.ok) throw new HttpError(401, 'google_token_invalid');
  const info = (await r.json()) as Record<string, any>;
  const issOk = info.iss === 'accounts.google.com' || info.iss === 'https://accounts.google.com';
  const verified = info.email_verified === true || info.email_verified === 'true';
  if (info.aud !== config.googleClientId || !issOk || !verified || !info.email || !info.sub) {
    throw new HttpError(401, 'google_token_invalid');
  }
  return {
    googleId: String(info.sub),
    email: String(info.email).toLowerCase(),
    firstName: info.given_name || String(info.email).split('@')[0],
    lastName: info.family_name || '',
    picture: info.picture || null,
  };
}
