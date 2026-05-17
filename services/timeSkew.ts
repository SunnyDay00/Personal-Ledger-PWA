import { FIXED_SYNC_ENDPOINT } from '../constants';

export interface TimeSkewResult {
  skewMs: number;
  absSkewMs: number;
  serverTime: number;
  localTime: number;
  roundTripMs: number;
  thresholdMs: number;
}

const endpoint = () => FIXED_SYNC_ENDPOINT.replace(/\/$/, '');

export async function checkSystemTimeSkew(
  thresholdMs: number = 2 * 60 * 1000,
  timeoutMs: number = 3000
): Promise<TimeSkewResult | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const res = await fetch(`${endpoint()}/time`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Time check failed: ${res.status}`);
    }

    const data = await res.json();
    const completedAt = Date.now();
    const serverTime = Number(data?.serverTime);
    if (!Number.isFinite(serverTime) || serverTime <= 0) return null;

    const localTimeAtServerResponse = Math.round((startedAt + completedAt) / 2);
    const skewMs = serverTime - localTimeAtServerResponse;
    const absSkewMs = Math.abs(skewMs);
    if (absSkewMs < thresholdMs) return null;

    return {
      skewMs,
      absSkewMs,
      serverTime,
      localTime: localTimeAtServerResponse,
      roundTripMs: completedAt - startedAt,
      thresholdMs,
    };
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      throw new Error(`Time check timed out after ${timeoutMs}ms`);
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}
