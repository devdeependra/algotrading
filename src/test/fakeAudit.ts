import type { AuditEntry, AuditLogRepository } from '../db/repositories/auditLog.js';

export class FakeAuditLog implements AuditLogRepository {
  readonly entries: AuditEntry[] = [];
  async append(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }
}
