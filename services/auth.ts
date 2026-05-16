import { FIXED_SYNC_ENDPOINT } from '../constants';
import { AuthSession, AuthUser } from '../types';

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
};

type MeResponse = {
  user: AuthUser;
  expiresAt: number;
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

export const logout = async (token: string): Promise<void> => {
  if (!token) return;

  const res = await fetch(`${endpoint()}/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok && res.status !== 401) {
    throw new AuthApiError(await parseError(res), res.status);
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
