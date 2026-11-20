import type pg from 'pg';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
}

export class DuplicateEmailError extends Error {
  constructor() {
    super('Email already registered');
    this.name = 'DuplicateEmailError';
  }
}

export interface UserRepository {
  /** Throws {@link DuplicateEmailError} if the email is taken (case-insensitive). */
  create(email: string, passwordHash: string): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: Date;
}

function toUser(row: UserRow): User {
  return { id: row.id, email: row.email, passwordHash: row.password_hash, createdAt: row.created_at };
}

const UNIQUE_VIOLATION = '23505';

export class PgUserRepository implements UserRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(email: string, passwordHash: string): Promise<User> {
    try {
      const { rows } = await this.pool.query<UserRow>(
        'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, password_hash, created_at',
        [email, passwordHash],
      );
      return toUser(rows[0] as UserRow);
    } catch (err) {
      if (typeof err === 'object' && err !== null && (err as { code?: string }).code === UNIQUE_VIOLATION) {
        throw new DuplicateEmailError();
      }
      throw err;
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    const { rows } = await this.pool.query<UserRow>(
      'SELECT id, email, password_hash, created_at FROM users WHERE lower(email) = lower($1)',
      [email],
    );
    return rows[0] ? toUser(rows[0]) : null;
  }

  async findById(id: string): Promise<User | null> {
    const { rows } = await this.pool.query<UserRow>(
      'SELECT id, email, password_hash, created_at FROM users WHERE id = $1',
      [id],
    );
    return rows[0] ? toUser(rows[0]) : null;
  }
}
