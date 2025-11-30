export interface D1SyncPayload {
  ledgers?: any[];
  categories?: any[];
  groups?: any[];
  transactions?: any[];
  settings?: any;
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

export async function pushToCloud(endpoint: string, token: string, userId: string, payload: D1SyncPayload) {
  const res = await fetch(`${endpoint.replace(/\/$/, '')}/sync/push?user_id=${encodeURIComponent(userId)}`, {
      method: 'POST',
      headers: buildHeaders(token),
      body: JSON.stringify(payload)
  });
  if (!res.ok) {
      const text = await res.text();
      throw new Error(`Push failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function pullFromCloud(endpoint: string, token: string, userId: string, since: number): Promise<D1PullResponse> {
  const res = await fetch(`${endpoint.replace(/\/$/, '')}/sync/pull?user_id=${encodeURIComponent(userId)}&since=${since}`, {
      method: 'GET',
      headers: buildHeaders(token)
  });
  if (!res.ok) {
      const text = await res.text();
      throw new Error(`Pull failed: ${res.status} ${text}`);
  }
  return res.json();
}
