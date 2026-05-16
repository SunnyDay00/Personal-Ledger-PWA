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

export async function pullFromCloud(token: string, since: number, timeoutMs: number = 15000): Promise<D1PullResponse> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
      const res = await fetch(`${workerUrl()}/sync/pull?since=${since}`, {
          method: 'GET',
          headers: buildHeaders(token),
          signal: controller.signal
      });
      clearTimeout(id);
      if (!res.ok) {
          throw await httpError('Pull failed', res);
      }
      return res.json();
  } catch (e: any) {
      clearTimeout(id);
      if (e.name === 'AbortError') {
          throw new Error(`Pull timed out after ${timeoutMs}ms`);
      }
      throw e;
  }
}

export async function getCloudVersion(token: string, timeoutMs: number = 10000): Promise<number> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
      const res = await fetch(`${workerUrl()}/sync/version`, {
          method: 'GET',
          headers: buildHeaders(token),
          signal: controller.signal
      });
      clearTimeout(id);
      if (!res.ok) {
          throw await httpError('Version check failed', res);
      }
      const data = await res.json();
      return Number(data.version || 0);
  } catch (e: any) {
      clearTimeout(id);
      if (e.name === 'AbortError') {
          throw new Error(`Version check timed out after ${timeoutMs}ms`);
      }
      throw e;
  }
}
