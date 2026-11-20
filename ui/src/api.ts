export interface Health {
  status: 'ok' | 'degraded';
  db: 'ok' | 'unavailable';
  version: string;
  time: string;
}

export type Role = 'superadmin' | 'admin' | 'member';
export type UserStatus = 'pending' | 'active' | 'suspended' | 'rejected';

export interface User {
  id: string;
  email: string;
  role: Role;
  status: UserStatus;
  approvedAt: string | null;
  createdAt: string;
}

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'same-origin', ...init });
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`);
  return body;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export const api = {
  health: () => fetch('/api/health').then((r) => r.json() as Promise<Health>),
  me: () => request<User>('/api/auth/me'),
  register: (email: string, password: string) => request<User>('/api/auth/register', json('POST', { email, password })),
  login: (email: string, password: string) => request<User>('/api/auth/login', json('POST', { email, password })),
  logout: () => request<void>('/api/auth/logout', json('POST')),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>('/api/auth/password', json('POST', { currentPassword, newPassword })),
  admin: {
    users: (status?: UserStatus) => request<User[]>(`/api/admin/users${status ? `?status=${status}` : ''}`),
    act: (id: string, action: 'approve' | 'reject' | 'suspend' | 'reinstate') =>
      request<User>(`/api/admin/users/${id}/${action}`, json('POST')),
    setRole: (id: string, role: 'admin' | 'member') => request<User>(`/api/admin/users/${id}/role`, json('PATCH', { role })),
  },
};

export const isAdmin = (u: User | null | undefined): boolean => u?.role === 'admin' || u?.role === 'superadmin';
