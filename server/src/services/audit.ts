import crypto from 'node:crypto';
import type { Request } from 'express';
import { now, run } from '../db.js';

export interface AuditActor {
  id: number | null;
  role: string | null;
  name: string | null;
}

export interface AuditOptions {
  actor?: AuditActor | null;
  entityType?: string;
  entityId?: number | string | null;
  result?: 'success' | 'failure';
  metadata?: Record<string, unknown>;
}

export function actorOf(u: { id: number; role: string; first_name: string; last_name: string }): AuditActor {
  return { id: u.id, role: u.role, name: `${u.first_name} ${u.last_name}`.trim() };
}

/** Appends an entry to the immutable audit log (UPDATE/DELETE are blocked by DB triggers). */
export function audit(req: Request | null, action: string, opts: AuditOptions = {}) {
  const actor = opts.actor !== undefined ? opts.actor : req?.user ? actorOf(req.user) : null;
  try {
    run(
      `INSERT INTO audit_log (event_id, user_id, user_name, role, action, entity_type, entity_id, result, ip, user_agent, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      crypto.randomUUID(),
      actor?.id ?? null,
      actor?.name ?? null,
      actor?.role ?? null,
      action,
      opts.entityType ?? null,
      opts.entityId != null ? String(opts.entityId) : null,
      opts.result ?? 'success',
      req?.ip ?? null,
      req?.get('user-agent')?.slice(0, 300) ?? null,
      JSON.stringify(opts.metadata ?? {}),
      now(),
    );
  } catch (e) {
    console.error('audit write failed', e);
  }
}
