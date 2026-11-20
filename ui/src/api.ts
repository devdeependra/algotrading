export interface Health {
  status: 'ok' | 'degraded';
  db: 'ok' | 'unavailable';
  version: string;
  time: string;
}

export interface Me {
  id: string;
  email: string;
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

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  health: () => fetch('/api/health').then((r) => r.json() as Promise<Health>),
  me: () => request<Me>('/api/auth/me'),
  register: (email: string, password: string) => request<Me>('/api/auth/register', json({ email, password })),
  login: (email: string, password: string) => request<Me>('/api/auth/login', json({ email, password })),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
};
