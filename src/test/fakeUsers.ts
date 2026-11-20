import { randomUUID } from 'node:crypto';
import { DuplicateEmailError } from '../db/repositories/users.js';
import type { NewUser, User, UserFilter, UserPatch, UserRepository } from '../db/repositories/users.js';

/** In-memory UserRepository with the same semantics as the Postgres one. */
export class FakeUserRepository implements UserRepository {
  readonly users: User[] = [];

  async create({ email, passwordHash, role, status }: NewUser): Promise<User> {
    if (this.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      throw new DuplicateEmailError();
    }
    const now = new Date();
    const user: User = { id: randomUUID(), email, passwordHash, role, status, approvedBy: null, approvedAt: null, createdAt: now, updatedAt: now };
    this.users.push(user);
    return { ...user };
  }

  async findByEmail(email: string): Promise<User | null> {
    const u = this.users.find((x) => x.email.toLowerCase() === email.toLowerCase());
    return u ? { ...u } : null;
  }

  async findById(id: string): Promise<User | null> {
    const u = this.users.find((x) => x.id === id);
    return u ? { ...u } : null;
  }

  async list(filter: UserFilter = {}): Promise<User[]> {
    return this.users.filter((u) => !filter.status || u.status === filter.status).map((u) => ({ ...u }));
  }

  async update(id: string, patch: UserPatch): Promise<User | null> {
    const u = this.users.find((x) => x.id === id);
    if (!u) return null;
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) (u as unknown as Record<string, unknown>)[k] = v;
    }
    u.updatedAt = new Date();
    return { ...u };
  }
}
