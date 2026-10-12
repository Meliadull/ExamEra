import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { db } from '../db.js';
import { notFound } from '../http.js';

/*
 * Database backups: a consistent snapshot via `VACUUM INTO` (safe while the server runs, WAL included).
 * Automatic backups are taken once a day and the oldest are pruned; manual ones are kept separately.
 */

const NAME_RE = /^examera-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(-manual)?\.db$/;
const DAY_MS = 24 * 3600_000;
const KEEP_MANUAL = 10;

export interface BackupInfo {
  name: string;
  size: number;
  created_at: string;
  kind: 'auto' | 'manual';
}

function dir() {
  fs.mkdirSync(config.backupDir, { recursive: true });
  return config.backupDir;
}

export function listBackups(): BackupInfo[] {
  return fs
    .readdirSync(dir())
    .filter((n) => NAME_RE.test(n))
    .map((name) => {
      const st = fs.statSync(path.join(config.backupDir, name));
      return { name, size: st.size, created_at: st.mtime.toISOString(), kind: name.endsWith('-manual.db') ? 'manual' : 'auto' } as BackupInfo;
    })
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

function prune() {
  const all = listBackups();
  const drop = [
    ...all.filter((b) => b.kind === 'auto').slice(config.backupKeep),
    ...all.filter((b) => b.kind === 'manual').slice(KEEP_MANUAL),
  ];
  for (const b of drop) fs.rmSync(path.join(config.backupDir, b.name), { force: true });
}

export function createBackup(kind: 'auto' | 'manual'): BackupInfo {
  const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
  const name = `examera-${stamp}${kind === 'manual' ? '-manual' : ''}.db`;
  const file = path.join(dir(), name);
  fs.rmSync(file, { force: true }); // VACUUM INTO refuses to overwrite
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  prune();
  const st = fs.statSync(file);
  return { name, size: st.size, created_at: st.mtime.toISOString(), kind };
}

/** Resolves a backup file by name; the strict pattern prevents path traversal. */
export function backupFile(name: string): string {
  if (!NAME_RE.test(name)) throw notFound();
  const file = path.join(config.backupDir, name);
  if (!fs.existsSync(file)) throw notFound();
  return file;
}

/** Takes an automatic backup if the latest one is older than a day. */
export function runScheduledBackup() {
  const lastAuto = listBackups().find((b) => b.kind === 'auto');
  if (!lastAuto || Date.now() - Date.parse(lastAuto.created_at) > DAY_MS) {
    const b = createBackup('auto');
    console.log(`Backup created: ${b.name}`);
  }
}
