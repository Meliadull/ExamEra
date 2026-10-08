import type { NextFunction, Request, Response } from 'express';
import type { z, ZodTypeAny } from 'zod';
import type { AuthUser, Role } from './types.js';

export class HttpError extends Error {
  constructor(public status: number, public code: string, public details?: unknown) {
    super(code);
  }
}

export const badRequest = (code = 'bad_request', details?: unknown) => new HttpError(400, code, details);
export const forbidden = (code = 'forbidden') => new HttpError(403, code);
export const notFound = (code = 'not_found') => new HttpError(404, code);
export const conflict = (code = 'conflict', details?: unknown) => new HttpError(409, code, details);

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw new HttpError(
      400,
      'validation_error',
      r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return r.data;
}

export function int(v: unknown): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw badRequest('invalid_id');
  return n;
}

export function optInt(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

export function qstr(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

export function paging(q: Record<string, unknown>, defaultSize = 25) {
  const page = Math.max(1, optInt(q.page) ?? 1);
  const pageSize = Math.min(200, Math.max(1, optInt(q.pageSize) ?? defaultSize));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function user(req: Request): AuthUser {
  if (!req.user) throw new HttpError(401, 'unauthorized');
  return req.user;
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, 'unauthorized'));
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, 'unauthorized'));
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.code, details: err.details });
  }
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'payload_too_large' });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid_json' });
  if (typeof err?.message === 'string' && err.message.includes('UNIQUE constraint failed')) {
    const field = err.message.split('.').pop();
    return res.status(409).json({ error: 'duplicate', details: { field } });
  }
  console.error(err);
  res.status(500).json({ error: 'internal_error' });
}
