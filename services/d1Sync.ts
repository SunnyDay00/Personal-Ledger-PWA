export interface D1SyncPayload {
  ledgers?: any[];
  categories?: any[];
  groups?: any[];
  transactions?: any[];
  settings?: any;
  cfConfig?: any;
}

export interface D1PullResponse {
  version: number;
  ledgers: any[];
  categories: any[];
  groups?: any[];
  transactions: any[];
  settings: any | null;
  cfConfig?: any;
}

const buildHeaders = (token: string) => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
};


export async function pushToCloud(endpoint: string, token: string, userId: string, payload: D1SyncPayload, timeoutMs: number = 15000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
      const res = await fetch(`${endpoint.replace(/\/$/, '')}/sync/push?user_id=${encodeURIComponent(userId)}`, {
          method: 'POST',
          headers: buildHeaders(token),
          body: JSON.stringify(payload),
          signal: controller.signal
      });
      clearTimeout(id);
      if (!res.ok) {
          const text = await res.text();
          throw new Error(`Push failed: ${res.status} ${text}`);
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

export async function pullFromCloud(endpoint: string, token: string, userId: string, since: number, timeoutMs: number = 15000): Promise<D1PullResponse> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
      const res = await fetch(`${endpoint.replace(/\/$/, '')}/sync/pull?user_id=${encodeURIComponent(userId)}&since=${since}`, {
          method: 'GET',
          headers: buildHeaders(token),
          signal: controller.signal
      });
      clearTimeout(id);
      if (!res.ok) {
          const text = await res.text();
          throw new Error(`Pull failed: ${res.status} ${text}`);
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
