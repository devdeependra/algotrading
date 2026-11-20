import { randomUUID } from 'node:crypto';
import { DuplicateEmailError } from '../db/repositories/users.js';
import type { User, UserRepository } from '../db/repositories/users.js';

/** In-memory UserRepository with the same semantics as the Postgres one. */
export class FakeUserRepository implements UserRepository {
  readonly users: User[] = [];

  async create(email: string, passwordHash: string): Promise<User> {
    if (this.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      throw new DuplicateEmailError();
    }
    const user: User = { id: randomUUID(), email, passwordHash, createdAt: new Date() };
    this.users.push(user);
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.users.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
  }

  async findById(id: string): Promise<User | null> {
    return this.users.find((u) => u.id === id) ?? null;
  }
}
