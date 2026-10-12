/* Recreates the database and fills it with demo data: `npm run seed`. The old database is backed up first. */
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

function fail(uz: string, ru: string, detail?: unknown): never {
  console.error(`\n✖ ${uz}\n✖ ${ru}\n`);
  if (detail) console.error(String(detail));
  process.exit(1);
}

// node:sqlite is available without flags since Node 22.13.
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  fail(
    `Node.js ${process.versions.node} eski. Node 22.13 yoki yangisini o'rnating: https://nodejs.org`,
    `Node.js ${process.versions.node} устарел. Установите Node 22.13 или новее: https://nodejs.org`,
  );
}

const files = ['', '-wal', '-shm'].map((s) => config.dbPath + s).filter((f) => fs.existsSync(f));

if (files.length) {
  try {
    // Keep a copy of the current database before wiping it.
    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    const dir = path.join(config.backupDir, `before-seed-${stamp}`);
    fs.mkdirSync(dir, { recursive: true });
    for (const f of files) fs.copyFileSync(f, path.join(dir, path.basename(f)));
    console.log(`Eski baza saqlandi / Старая база сохранена: ${dir}`);
    for (const f of files) fs.rmSync(f, { force: true });
  } catch (e: any) {
    if (e?.code === 'EBUSY' || e?.code === 'EPERM') {
      fail(
        "Baza fayli band: avval saytni to'xtating (npm run dev oynasida Ctrl+C), keyin npm run seed ni qayta bering.",
        'Файл базы занят: сначала остановите сайт (Ctrl+C в окне npm run dev), затем снова выполните npm run seed.',
        e.message,
      );
    }
    throw e;
  }
}

const { migrate } = await import('./db.js');
const { seedDemo } = await import('./seed.js');
migrate();
await seedDemo();
