import crypto from 'node:crypto';
import { config } from '../config.js';
import { get, now, run } from '../db.js';
import { badRequest, HttpError } from '../http.js';
import { sha256 } from './auth.js';

const TTL_MS = 5 * 60_000;
const COOLDOWN_MS = 60_000;
const MAX_ATTEMPTS = 5;

async function sendSms(phone: string, text: string) {
  switch (config.smsProvider) {
    case 'console':
      console.log(`[SMS → ${phone}] ${text}`);
      return;
    default:
      // Plug a real gateway here (Eskiz, Play Mobile, Twilio, ...).
      throw new HttpError(503, 'sms_provider_unavailable');
  }
}

export async function issueOtp(phone: string, purpose: 'register' | 'recover'): Promise<string> {
  const last = get<{ created_at: string }>(
    'SELECT created_at FROM otp_codes WHERE phone = ? AND purpose = ? ORDER BY id DESC LIMIT 1',
    phone,
    purpose,
  );
  if (last && Date.now() - Date.parse(last.created_at) < COOLDOWN_MS) {
    throw new HttpError(429, 'otp_cooldown', {
      retryAfterSec: Math.ceil((COOLDOWN_MS - (Date.now() - Date.parse(last.created_at))) / 1000),
    });
  }
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  run(
    'INSERT INTO otp_codes (phone, purpose, code_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
    phone,
    purpose,
    sha256(`${phone}:${code}`),
    now(),
    new Date(Date.now() + TTL_MS).toISOString(),
  );
  await sendSms(phone, `ExamEra: ваш код подтверждения ${code}. Никому его не сообщайте.`);
  return code;
}

export function verifyOtp(phone: string, purpose: 'register' | 'recover', code: string) {
  const row = get<{ id: number; code_hash: string; attempts: number; expires_at: string }>(
    `SELECT id, code_hash, attempts, expires_at FROM otp_codes
     WHERE phone = ? AND purpose = ? AND used_at IS NULL ORDER BY id DESC LIMIT 1`,
    phone,
    purpose,
  );
  if (!row) throw badRequest('otp_invalid');
  if (row.expires_at < now()) throw badRequest('otp_expired');
  if (row.attempts >= MAX_ATTEMPTS) throw badRequest('otp_attempts_exceeded');
  if (row.code_hash !== sha256(`${phone}:${code}`)) {
    run('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?', row.id);
    throw badRequest('otp_invalid');
  }
  run('UPDATE otp_codes SET used_at = ? WHERE id = ?', now(), row.id);
}
