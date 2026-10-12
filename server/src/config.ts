import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const serverRoot = path.resolve(here, '..');

const envFile = path.join(serverRoot, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const env = process.env;

export const config = {
  port: Number(env.API_PORT || (env.NODE_ENV === 'production' ? env.PORT : '') || 4000),
  isProd: env.NODE_ENV === 'production',
  dbPath: path.resolve(serverRoot, env.DB_PATH || 'data/examera.db'),
  uploadsDir: path.resolve(serverRoot, env.UPLOADS_DIR || 'data/uploads'),
  clientDist: path.resolve(serverRoot, '../client/dist'),
  googleClientId: env.GOOGLE_CLIENT_ID || '',
  smsProvider: env.SMS_PROVIDER || 'console',
  cookieSecure: env.COOKIE_SECURE === 'true',
  trustProxy: env.TRUST_PROXY === 'true',
  seedDemo: env.SEED_DEMO !== 'false',
  backupDir: path.resolve(serverRoot, env.BACKUP_DIR || 'data/backups'),
  backupKeep: Number(env.BACKUP_KEEP || 14),
};
