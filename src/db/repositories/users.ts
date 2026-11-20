import type pg from 'pg';

export const ROLES = ['superadmin', 'admin', 'member'] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUSES = ['pending', 'active', 'suspended', 'rejected'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  status: UserStatus;
  approvedBy: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** What the API returns. Never includes the password hash. */
export interface PublicUser {
  id: string;
  email: string;
  role: Role;
  status: UserStatus;
  approvedAt: string | null;
  createdAt: string;
}

export function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    status: u.status,
    approvedAt: u.approvedAt ? u.approvedAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
  };
}

export interface NewUser {
  email: string;
  passwordHash: string;
  role: Role;
  status: UserStatus;
}

export interface UserPatch {
  role?: Role;
  status?: UserStatus;
  approvedBy?: string | null;
  approvedAt?: Date | null;
  passwordHash?: string;
}

export interface UserFilter {
  status?: UserStatus;
}

export class DuplicateEmailError extends Error {
  constructor() {
    super('Email already registered');
    this.name = 'DuplicateEmailError';
  }
}

export interface UserRepository {
  /** Throws {@link DuplicateEmailError} if the email is taken (case-insensitive). */
  create(user: NewUser): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  /** Oldest first. */
  list(filter?: UserFilter): Promise<User[]>;
  /** Returns null if no such user. */
  update(id: string, patch: UserPatch): Promise<User | null>;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: Role;
  status: UserStatus;
  approved_by: string | null;
  approved_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const COLUMNS = 'id, email, password_hash, role, status, approved_by, approved_at, created_at, updated_at';

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    status: row.status,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const UNIQUE_VIOLATION = '23505';

const PATCH_COLUMNS: Record<keyof UserPatch, string> = {
  role: 'role',
  status: 'status',
  approvedBy: 'approved_by',
  approvedAt: 'approved_at',
  passwordHash: 'password_hash',
};

export class PgUserRepository implements UserRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create({ email, passwordHash, role, status }: NewUser): Promise<User> {
    try {
      const { rows } = await this.pool.query<UserRow>(
        `INSERT INTO users (email, password_hash, role, status) VALUES ($1, $2, $3, $4) RETURNING ${COLUMNS}`,
        [email, passwordHash, role, status],
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
      `SELECT ${COLUMNS} FROM users WHERE lower(email) = lower($1)`,
      [email],
    );
    return rows[0] ? toUser(rows[0]) : null;
  }

  async findById(id: string): Promise<User | null> {
    const { rows } = await this.pool.query<UserRow>(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [id]);
    return rows[0] ? toUser(rows[0]) : null;
  }

  async list(filter: UserFilter = {}): Promise<User[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.status) {
      params.push(filter.status);
      where.push(`status = $${params.length}`);
    }
    const sql = `SELECT ${COLUMNS} FROM users${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at ASC, id ASC`;
    const { rows } = await this.pool.query<UserRow>(sql, params);
    return rows.map(toUser);
  }

  async update(id: string, patch: UserPatch): Promise<User | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const key of Object.keys(patch) as (keyof UserPatch)[]) {
      if (patch[key] === undefined) continue;
      params.push(patch[key]);
      sets.push(`${PATCH_COLUMNS[key]} = $${params.length}`);
    }
    if (sets.length === 0) return this.findById(id);
    sets.push('updated_at = now()');
    params.push(id);
    const { rows } = await this.pool.query<UserRow>(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING ${COLUMNS}`,
      params,
    );
    return rows[0] ? toUser(rows[0]) : null;
  }
}
