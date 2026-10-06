import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCloudVersion, pullFromCloud, pushToCloud } from './d1Sync';

const payload = { version: 123, ledgers: [], categories: [], groups: [], transactions: [], settings: null };
const timeoutFetch = (_url: unknown, options: RequestInit) => new Promise<Response>((resolve, reject) => {
  options.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
});
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('cloud sync read timeout recovery', () => {
  it('retries a timed-out pull once with the same cursor and credentials', async () => {
    const fetchMock = vi.fn().mockImplementationOnce(timeoutFetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(payload)));
    vi.stubGlobal('fetch', fetchMock);
    const result = pullFromCloud('fixture-token', 123, 50);
    await vi.advanceTimersByTimeAsync(50);
    expect(await result).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe(fetchMock.mock.calls[1][0]);
    expect(fetchMock.mock.calls[1][0]).toContain('since=123');
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer fixture-token');
  });

  it('bounds repeated timeouts without misreporting the login as invalid', async () => {
    const fetchMock = vi.fn(timeoutFetch);
    vi.stubGlobal('fetch', fetchMock);
    const result = pullFromCloud('fixture-token', 123, 50).catch(error => error);
    await vi.advanceTimersByTimeAsync(100);
    const error = await result;
    expect(error.message).toContain('Pull timed out after 50ms (2 attempts)');
    expect(error.status).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps the timeout active while reading a response body', async () => {
    const fetchMock = vi.fn().mockImplementationOnce((_url, options: RequestInit) => Promise.resolve({
      ok: true, json: () => timeoutFetch(_url, options),
    })).mockResolvedValueOnce(new Response(JSON.stringify(payload)));
    vi.stubGlobal('fetch', fetchMock);
    const result = pullFromCloud('fixture-token', 0, 50);
    await vi.advanceTimersByTimeAsync(50);
    expect(await result).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('preserves a real unauthorized response without retrying it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await pullFromCloud('fixture-token', 0).catch(error => error);
    expect(result.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not automatically retry writes and retains the version result contract', async () => {
    const fetchMock = vi.fn().mockImplementationOnce(timeoutFetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ version: 123 })));
    vi.stubGlobal('fetch', fetchMock);
    const written = pushToCloud('fixture-token', { settings: {} }, 50).catch(error => error);
    await vi.advanceTimersByTimeAsync(50);
    expect((await written).message).toContain('Push timed out');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await getCloudVersion('fixture-token')).toBe(123);
  });
});
