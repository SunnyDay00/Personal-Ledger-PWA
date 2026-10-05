import { FIXED_SYNC_ENDPOINT } from '../constants';
import { AuthSession, AuthUser, LogoutAfter } from '../types';

// A legacy deadline must first be validated by the upgraded Worker, which
// migrates still-valid old sessions. Never silently discard its token.
export const hasSessionExpired = (session?: AuthSession, now = Date.now()): boolean =>
  !!session?.token && !!session.logoutAfter && session.logoutAfter !== 'permanent'
    && session.expiresAt <= now;

export class AuthApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'AuthApiError';
    this.status = status;
  }
}

type AuthResponse = {
  user: AuthUser;
  token: string;
  expiresAt: number;
  logoutAfter: LogoutAfter;
};

type MeResponse = {
  user: AuthUser;
  expiresAt: number;
  logoutAfter: LogoutAfter;
};

const endpoint = () => FIXED_SYNC_ENDPOINT.replace(/\/$/, '');

const parseError = async (res: Response) => {
  const text = await res.text();
  if (!text) return `HTTP ${res.status}`;
  try {
    const data = JSON.parse(text);
    return data.error || data.message || text;
  } catch {
    return text;
  }
};

const postJson = async <T>(path: string, body: unknown, token?: string): Promise<T> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${endpoint()}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new AuthApiError(await parseError(res), res.status);
  }

  return res.json();
};

export const register = async (
  username: string,
  password: string,
  inviteCode: string
): Promise<AuthSession> => {
  return postJson<AuthResponse>('/auth/register', { username, password, inviteCode });
};

export const login = async (username: string, password: string): Promise<AuthSession> => {
  return postJson<AuthResponse>('/auth/login', { username, password });
};

export const updateSessionPolicy = (token: string, logoutAfter: LogoutAfter): Promise<MeResponse> =>
  postJson<MeResponse>('/auth/session', { logoutAfter }, token);

export const logout = async (token: string): Promise<void> => {
  if (!token) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(`${endpoint()}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });

    if (!res.ok && res.status !== 401) {
      throw new AuthApiError(await parseError(res), res.status);
    }
  } finally {
    clearTimeout(timeout);
  }
};

export const getMe = async (token: string, timeoutMs = 2500): Promise<MeResponse> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${endpoint()}/auth/me`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      throw new AuthApiError('登录状态校验超时，请稍后重试', 0);
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new AuthApiError(await parseError(res), res.status);
  }

  return res.json();
};
