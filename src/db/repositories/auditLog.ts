import type pg from 'pg';

export interface AuditEntry {
  /** Null for system actions (startup reconciliation, scheduler). */
  actorId: string | null;
  /** Dotted, past tense: `user.approved`, `user.role_changed`. */
  action: string;
  entityType: string;
  entityId: string;
  /** Public shapes only. Never credentials or hashes. */
  before?: unknown;
  after?: unknown;
}

export interface AuditLogRepository {
  append(entry: AuditEntry): Promise<void>;
}

export class PgAuditLogRepository implements AuditLogRepository {
  constructor(private readonly pool: pg.Pool) {}

  async append(entry: AuditEntry): Promise<void> {
    await this.pool.query(
      'INSERT INTO audit_log (actor_id, action, entity_type, entity_id, before, after) VALUES ($1, $2, $3, $4, $5, $6)',
      [
        entry.actorId,
        entry.action,
        entry.entityType,
        entry.entityId,
        entry.before === undefined ? null : JSON.stringify(entry.before),
        entry.after === undefined ? null : JSON.stringify(entry.after),
      ],
    );
  }
}
