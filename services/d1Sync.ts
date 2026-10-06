import { FIXED_SYNC_ENDPOINT } from '../constants';

export interface D1SyncPayload {
  ledgers?: any[];
  categories?: any[];
  groups?: any[];
  transactions?: any[];
  settings?: any;
}

export interface D1PushEntityResult {
  entityType: string;
  id: string;
  updatedAt: number;
  serverUpdatedAt?: number | null;
}

export interface D1PushResponse {
  ok?: boolean;
  success?: boolean;
  version?: number;
  accepted?: D1PushEntityResult[];
  superseded?: D1PushEntityResult[];
  results?: {
    accepted?: D1PushEntityResult[];
    superseded?: D1PushEntityResult[];
  };
}

export interface D1PullResponse {
  version: number;
  ledgers: any[];
  categories: any[];
  groups?: any[];
  transactions: any[];
  settings: any | null;
}

const buildHeaders = (token: string) => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
};

const workerUrl = () => FIXED_SYNC_ENDPOINT.replace(/\/$/, '');

const httpError = async (prefix: string, res: Response) => {
  const text = await res.text();
  const error = new Error(`${prefix}: ${res.status} ${text}`) as Error & { status?: number };
  error.status = res.status;
  return error;
};

const readCloudJson = async <T>(path: string, token: string, prefix: string, timeoutMs: number): Promise<T> => {
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${workerUrl()}${path}`, {
        method: 'GET', headers: buildHeaders(token), signal: controller.signal,
      });
      if (!response.ok) throw await httpError(`${prefix} failed`, response);
      // Keep the deadline active until the entire response has been decoded.
      return await response.json();
    } catch (error: any) {
      if (error?.name === 'AbortError' || controller.signal.aborted) {
        if (attempt === 0) continue; // Read-only retry; never retry writes here.
        throw new Error(`${prefix} timed out after ${timeoutMs}ms (2 attempts)`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`${prefix} failed`);
};

export async function pushToCloud(token: string, payload: D1SyncPayload, timeoutMs: number = 15000): Promise<D1PushResponse> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
      const res = await fetch(`${workerUrl()}/sync/push`, {
          method: 'POST',
          headers: buildHeaders(token),
          body: JSON.stringify(payload),
          signal: controller.signal
      });
      clearTimeout(id);
      if (!res.ok) {
          throw await httpError('Push failed', res);
      }
      return res.json();
  } catch (e: any) {
      clearTimeout(id);
      if (e.name === 'AbortError') {
          throw new Error(`Push timed out after ${timeoutMs}ms`);
      }
      throw e;
  }
}

export async function pullFromCloud(token: string, since: number, timeoutMs: number = 45000): Promise<D1PullResponse> {
  return readCloudJson<D1PullResponse>(`/sync/pull?since=${since}`, token, 'Pull', timeoutMs);
}

export async function getCloudVersion(token: string, timeoutMs: number = 25000): Promise<number> {
  const data = await readCloudJson<{ version?: number }>('/sync/version', token, 'Version check', timeoutMs);
  return Number(data.version || 0);
}
