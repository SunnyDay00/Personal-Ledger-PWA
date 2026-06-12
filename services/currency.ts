import { DEFAULT_CURRENCY, FIXED_SYNC_ENDPOINT } from '../constants';
import { ExchangeRatesSnapshot } from '../types';
import { normalizeCurrencyCode } from '../utils';

const EXCHANGE_RATES_CACHE_KEY = 'personal-ledger-exchange-rates:CNY';
const FALLBACK_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export const CNY_EXCHANGE_RATES: ExchangeRatesSnapshot = {
  baseCode: DEFAULT_CURRENCY,
  provider: 'local',
  fetchedAt: Date.now(),
  rates: { CNY: 1 },
};

const workerUrl = () => FIXED_SYNC_ENDPOINT.replace(/\/$/, '');

const normalizeSnapshot = (raw: any): ExchangeRatesSnapshot | null => {
  const rates = raw?.rates && typeof raw.rates === 'object' ? raw.rates : null;
  if (!rates) return null;

  const normalizedRates = Object.entries(rates).reduce<Record<string, number>>((acc, [code, value]) => {
    const normalizedCode = normalizeCurrencyCode(code, '');
    const parsed = Number(value);
    if (normalizedCode && Number.isFinite(parsed) && parsed > 0) {
      acc[normalizedCode] = parsed;
    }
    return acc;
  }, {});

  if (!normalizedRates.CNY) normalizedRates.CNY = 1;

  return {
    baseCode: normalizeCurrencyCode(raw.baseCode ?? raw.base_code, DEFAULT_CURRENCY),
    provider: String(raw.provider || 'ExchangeRate-API'),
    documentation: raw.documentation,
    termsOfUse: raw.termsOfUse ?? raw.terms_of_use,
    timeLastUpdateUnix: Number(raw.timeLastUpdateUnix ?? raw.time_last_update_unix) || undefined,
    timeLastUpdateUtc: raw.timeLastUpdateUtc ?? raw.time_last_update_utc,
    timeNextUpdateUnix: Number(raw.timeNextUpdateUnix ?? raw.time_next_update_unix) || undefined,
    timeNextUpdateUtc: raw.timeNextUpdateUtc ?? raw.time_next_update_utc,
    fetchedAt: Number(raw.fetchedAt) || Date.now(),
    rates: normalizedRates,
  };
};

const isSnapshotFresh = (snapshot: ExchangeRatesSnapshot) => {
  const nextUpdateMs = snapshot.timeNextUpdateUnix ? snapshot.timeNextUpdateUnix * 1000 : snapshot.fetchedAt + FALLBACK_CACHE_TTL_MS;
  return Date.now() < nextUpdateMs;
};

export const getCachedExchangeRates = (allowStale = false): ExchangeRatesSnapshot | null => {
  if (typeof localStorage === 'undefined') return null;
  try {
    const cached = localStorage.getItem(EXCHANGE_RATES_CACHE_KEY);
    if (!cached) return null;
    const snapshot = normalizeSnapshot(JSON.parse(cached));
    if (!snapshot) return null;
    return allowStale || isSnapshotFresh(snapshot) ? snapshot : null;
  } catch {
    return null;
  }
};

const saveCachedExchangeRates = (snapshot: ExchangeRatesSnapshot) => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(EXCHANGE_RATES_CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore quota or private-mode cache failures; callers still receive rates.
  }
};

export const fetchLatestExchangeRates = async (force = false): Promise<ExchangeRatesSnapshot> => {
  if (!force) {
    const freshCache = getCachedExchangeRates(false);
    if (freshCache) return freshCache;
  }

  const response = await fetch(`${workerUrl()}/exchange-rates/latest?base=${DEFAULT_CURRENCY}`);
  if (!response.ok) {
    throw new Error(`汇率更新失败：${response.status}`);
  }

  const data = await response.json();
  if (data?.stale) {
    throw new Error('汇率缓存已过期，请稍后联网刷新后重试');
  }

  const snapshot = normalizeSnapshot(data);
  if (!snapshot) throw new Error('汇率数据格式无效');
  snapshot.fetchedAt = Date.now();
  saveCachedExchangeRates(snapshot);
  return snapshot;
};

export const getDisplayExchangeRates = () =>
  getCachedExchangeRates(true) || CNY_EXCHANGE_RATES;
