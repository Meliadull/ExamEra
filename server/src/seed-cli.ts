/* Recreates the database and fills it with demo data: `npm run seed`. */
import fs from 'node:fs';
import { config } from './config.js';

for (const suffix of ['', '-wal', '-shm']) fs.rmSync(config.dbPath + suffix, { force: true });

const { migrate } = await import('./db.js');
const { seedDemo } = await import('./seed.js');
migrate();
await seedDemo();
