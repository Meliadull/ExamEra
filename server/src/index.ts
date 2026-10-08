import cookieParser from 'cookie-parser';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import helmet from 'helmet';
import { config } from './config.js';
import { get, migrate } from './db.js';
import { errorHandler, notFound } from './http.js';
import { adminRouter, auditRouter, notificationsRouter, searchRouter } from './routes/admin.js';
import { analyticsRouter } from './routes/analytics.js';
import { assignmentsRouter } from './routes/assignments.js';
import { attemptsRouter, studentRouter } from './routes/attempts.js';
import { authRouter } from './routes/auth.js';
import { groupsRouter, subjectsRouter } from './routes/groups.js';
import { reportsRouter, resultsRouter } from './routes/reports.js';
import { questionsRouter, testsRouter, uploadsRouter } from './routes/tests.js';
import { profileRouter, usersRouter } from './routes/users.js';
import { runPeriodicJobs } from './services/attempts.js';
import { auditorReadOnly, authenticate } from './services/auth.js';
import { seedDemo } from './seed.js';

migrate();
if (config.seedDemo && get<{ c: number }>('SELECT COUNT(*) AS c FROM users')!.c === 0) {
  await seedDemo();
}

const app = express();
app.set('trust proxy', config.trustProxy ? 1 : false);
app.disable('x-powered-by');
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://accounts.google.com/gsi/client'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://accounts.google.com/gsi/style', 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        connectSrc: ["'self'", 'https://accounts.google.com/gsi/'],
        frameSrc: ['https://accounts.google.com/gsi/'],
        upgradeInsecureRequests: config.cookieSecure ? [] : null,
      },
    },
  }),
);
app.use(express.json({ limit: '8mb' }));
app.use(cookieParser());
app.use('/uploads', express.static(config.uploadsDir, { maxAge: '7d', fallthrough: false, index: false }));

const api = express.Router();
api.use(authenticate, auditorReadOnly);
api.get('/health', (_req, res) => res.json({ ok: true }));
api.use('/auth', authRouter);
api.use('/profile', profileRouter);
api.use('/users', usersRouter);
api.use('/groups', groupsRouter);
api.use('/subjects', subjectsRouter);
api.use('/tests', testsRouter);
api.use('/questions', questionsRouter);
api.use('/uploads', uploadsRouter);
api.use('/assignments', assignmentsRouter);
api.use('/attempts', attemptsRouter);
api.use('/student', studentRouter);
api.use('/analytics', analyticsRouter);
api.use('/results', resultsRouter);
api.use('/reports', reportsRouter);
api.use('/audit', auditRouter);
api.use('/notifications', notificationsRouter);
api.use('/admin', adminRouter);
api.use('/search', searchRouter);
api.use(() => {
  throw notFound();
});
app.use('/api', api);

if (fs.existsSync(config.clientDist)) {
  app.use(express.static(config.clientDist, { index: false, maxAge: '1h' }));
  app.get(/^\/(?!api\/|uploads\/).*/, (_req, res) => res.sendFile(path.join(config.clientDist, 'index.html')));
}

app.use(errorHandler);

setInterval(() => {
  try {
    runPeriodicJobs();
  } catch (e) {
    console.error('periodic job failed', e);
  }
}, 15_000).unref();
runPeriodicJobs();

app.listen(config.port, () => {
  console.log(`ExamEra API: http://localhost:${config.port}`);
});
