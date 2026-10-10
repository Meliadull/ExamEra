import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { all, get, getSetting, now, run } from '../db.js';
import { conflict, forbidden, HttpError, parse, requireAuth, user } from '../http.js';
import { actorOf, audit } from '../services/audit.js';
import {
  assertNotLocked,
  checkPasswordPolicy,
  clearFailures,
  clearSessionCookie,
  createSession,
  hashPassword,
  loadAuthUser,
  normalizePhone,
  registerFailure,
  revokeUserSessions,
  verifyGoogleCredential,
  verifyPassword,
} from '../services/auth.js';
import { notifyAdmins } from '../services/notify.js';
import { issueOtp, verifyOtp } from '../services/otp.js';

export const authRouter = Router();

const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 100, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'rate_limited' } });
const otpLimiter = rateLimit({ windowMs: 10 * 60_000, limit: 6, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'rate_limited' } });

const phoneField = z
  .string()
  .max(32)
  .transform((v, ctx) => {
    const p = normalizePhone(v);
    if (!p) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid_phone' });
      return z.NEVER;
    }
    return p;
  });
const nameField = z.string().trim().min(1).max(60);
const codeField = z.string().regex(/^\d{6}$/);

function meResponse(id: number) {
  const u = loadAuthUser(id)!;
  const unread = get<{ c: number }>('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL', id)!.c;
  return { user: u, unreadNotifications: unread };
}

authRouter.get('/config', (_req, res) => {
  res.json({
    platformName: getSetting('platform_name'),
    googleClientId: getSetting('google_auth_enabled') === '1' ? config.googleClientId || null : null,
    registrationEnabled: getSetting('registration_enabled') === '1',
    smsDevMode: config.smsProvider === 'console',
    minPasswordLength: Number(getSetting('min_password_length')) || 8,
    defaultLanguage: getSetting('default_language'),
  });
});

authRouter.get('/me', requireAuth, (req, res) => res.json(meResponse(user(req).id)));

authRouter.post('/otp', otpLimiter, async (req, res) => {
  const b = parse(z.object({ phone: phoneField, purpose: z.enum(['register', 'recover']) }), req.body);
  const existing = get<{ id: number }>('SELECT id FROM users WHERE phone = ?', b.phone);
  if (b.purpose === 'register') {
    if (getSetting('registration_enabled') !== '1') throw forbidden('registration_disabled');
    if (existing) throw conflict('phone_taken');
  } else if (!existing) {
    // Do not reveal whether the phone is registered.
    return res.json({ ok: true });
  }
  const code = await issueOtp(b.phone, b.purpose);
  res.json({ ok: true, devCode: config.smsProvider === 'console' ? code : undefined });
});

authRouter.post('/register', authLimiter, async (req, res) => {
  if (getSetting('registration_enabled') !== '1') throw forbidden('registration_disabled');
  const b = parse(
    z.object({
      phone: phoneField,
      firstName: nameField,
      lastName: nameField,
      password: z.string(),
      code: codeField,
      remember: z.boolean().optional(),
      asTeacher: z.boolean().optional(),
    }),
    req.body,
  );
  checkPasswordPolicy(b.password);
  if (get('SELECT 1 FROM users WHERE phone = ?', b.phone)) throw conflict('phone_taken');
  verifyOtp(b.phone, 'register', b.code);
  const hash = await hashPassword(b.password);
  const t = now();
  const { id } = run(
    `INSERT INTO users (first_name, last_name, phone, password_hash, role, status, requested_role, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'student', 'active', ?, ?, ?)`,
    b.firstName,
    b.lastName,
    b.phone,
    hash,
    b.asTeacher ? 'teacher' : null,
    t,
    t,
  );
  const actor = { id, role: 'student', name: `${b.firstName} ${b.lastName}` };
  audit(req, 'user.register', { actor, entityType: 'user', entityId: id, metadata: { method: 'phone', asTeacher: !!b.asTeacher } });
  if (b.asTeacher) notifyAdmins('teacher_request', { name: actor.name }, `/app/roles?user=${id}`);
  createSession(req, res, id, b.remember ?? true);
  audit(req, 'auth.login', { actor, entityType: 'user', entityId: id, metadata: { method: 'phone' } });
  res.status(201).json(meResponse(id));
});

authRouter.post('/login', authLimiter, async (req, res) => {
  const b = parse(
    z.object({ login: z.string().trim().min(3).max(120), password: z.string().min(1).max(128), remember: z.boolean().optional() }),
    req.body,
  );
  const isEmail = b.login.includes('@');
  const ident = isEmail ? b.login.toLowerCase() : normalizePhone(b.login);
  const key = `login:${ident ?? b.login.toLowerCase()}`;
  assertNotLocked(key);
  const u = ident
    ? get<{ id: number; role: string; first_name: string; last_name: string; status: string; password_hash: string | null }>(
        `SELECT id, role, first_name, last_name, status, password_hash FROM users WHERE ${isEmail ? 'email' : 'phone'} = ?`,
        ident,
      )
    : undefined;
  const ok = await verifyPassword(b.password, u?.password_hash ?? null);
  if (!u || !ok) {
    registerFailure(key);
    audit(req, 'auth.login_failed', {
      actor: u ? actorOf(u) : null,
      entityType: 'user',
      entityId: u?.id ?? null,
      result: 'failure',
      metadata: { login: isEmail ? b.login.replace(/^(.).*@/, '$1***@') : b.login.replace(/\d(?=\d{2})/g, '*') },
    });
    throw new HttpError(401, 'invalid_credentials');
  }
  if (u.status !== 'active') {
    audit(req, 'auth.login_failed', { actor: actorOf(u), entityType: 'user', entityId: u.id, result: 'failure', metadata: { reason: u.status } });
    throw forbidden('account_blocked');
  }
  clearFailures(key);
  createSession(req, res, u.id, b.remember ?? false);
  audit(req, 'auth.login', { actor: actorOf(u), entityType: 'user', entityId: u.id, metadata: { method: isEmail ? 'email' : 'phone' } });
  res.json(meResponse(u.id));
});

authRouter.post('/google', authLimiter, async (req, res) => {
  if (getSetting('google_auth_enabled') !== '1') throw forbidden('google_disabled');
  const b = parse(z.object({ credential: z.string().min(10).max(5000), remember: z.boolean().optional() }), req.body);
  const g = await verifyGoogleCredential(b.credential);
  let u = get<{ id: number; role: string; first_name: string; last_name: string; status: string; google_id: string | null }>(
    'SELECT id, role, first_name, last_name, status, google_id FROM users WHERE google_id = ? OR email = ? ORDER BY google_id IS NULL LIMIT 1',
    g.googleId,
    g.email,
  );
  if (!u) {
    if (getSetting('registration_enabled') !== '1') throw forbidden('registration_disabled');
    const t = now();
    const { id } = run(
      `INSERT INTO users (first_name, last_name, email, google_id, avatar_url, role, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'student', 'active', ?, ?)`,
      g.firstName,
      g.lastName,
      g.email,
      g.googleId,
      g.picture,
      t,
      t,
    );
    u = { id, role: 'student', first_name: g.firstName, last_name: g.lastName, status: 'active', google_id: g.googleId };
    audit(req, 'user.register', { actor: actorOf(u), entityType: 'user', entityId: id, metadata: { method: 'google' } });
  } else if (!u.google_id) {
    run('UPDATE users SET google_id = ?, updated_at = ? WHERE id = ?', g.googleId, now(), u.id);
    audit(req, 'user.google_linked', { actor: actorOf(u), entityType: 'user', entityId: u.id });
  }
  if (u.status !== 'active') {
    audit(req, 'auth.login_failed', { actor: actorOf(u), entityType: 'user', entityId: u.id, result: 'failure', metadata: { reason: u.status, method: 'google' } });
    throw forbidden('account_blocked');
  }
  createSession(req, res, u.id, b.remember ?? true);
  audit(req, 'auth.login', { actor: actorOf(u), entityType: 'user', entityId: u.id, metadata: { method: 'google' } });
  res.json(meResponse(u.id));
});

authRouter.post('/recover', authLimiter, async (req, res) => {
  const b = parse(z.object({ phone: phoneField, code: codeField, password: z.string() }), req.body);
  checkPasswordPolicy(b.password);
  const u = get<{ id: number; role: string; first_name: string; last_name: string }>(
    'SELECT id, role, first_name, last_name FROM users WHERE phone = ?',
    b.phone,
  );
  verifyOtp(b.phone, 'recover', b.code);
  if (!u) throw new HttpError(400, 'otp_invalid');
  run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', await hashPassword(b.password), now(), u.id);
  revokeUserSessions(u.id);
  audit(req, 'auth.password_reset', { actor: actorOf(u), entityType: 'user', entityId: u.id, metadata: { method: 'otp' } });
  res.json({ ok: true });
});

authRouter.post('/logout', (req, res) => {
  if (req.sessionId) {
    run('UPDATE sessions SET revoked_at = ? WHERE id = ?', now(), req.sessionId);
    audit(req, 'auth.logout', { entityType: 'user', entityId: req.user?.id });
  }
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get('/sessions', requireAuth, (req, res) => {
  const rows = all(
    `SELECT id, created_at, last_seen_at, expires_at, ip, user_agent FROM sessions
     WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY last_seen_at DESC`,
    user(req).id,
    now(),
  );
  res.json(rows.map((r: any) => ({ ...r, current: r.id === req.sessionId })));
});

authRouter.delete('/sessions/:id', requireAuth, (req, res) => {
  run('UPDATE sessions SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL', now(), Number(req.params.id), user(req).id);
  audit(req, 'auth.session_revoked', { entityType: 'session', entityId: Number(req.params.id) });
  res.json({ ok: true });
});

authRouter.post('/sessions/revoke-others', requireAuth, (req, res) => {
  revokeUserSessions(user(req).id, req.sessionId);
  audit(req, 'auth.sessions_revoked', { entityType: 'user', entityId: user(req).id });
  res.json({ ok: true });
});

authRouter.post('/password', requireAuth, async (req, res) => {
  const me = user(req);
  const b = parse(z.object({ current: z.string().max(128).optional(), next: z.string(), logoutOthers: z.boolean().optional() }), req.body);
  const row = get<{ password_hash: string | null }>('SELECT password_hash FROM users WHERE id = ?', me.id)!;
  if (row.password_hash && !(await verifyPassword(b.current ?? '', row.password_hash))) {
    audit(req, 'user.password_change', { entityType: 'user', entityId: me.id, result: 'failure' });
    throw new HttpError(400, 'wrong_current_password');
  }
  checkPasswordPolicy(b.next);
  run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', await hashPassword(b.next), now(), me.id);
  if (b.logoutOthers) revokeUserSessions(me.id, req.sessionId);
  audit(req, 'user.password_change', { entityType: 'user', entityId: me.id, metadata: { logoutOthers: !!b.logoutOthers } });
  res.json({ ok: true });
});
