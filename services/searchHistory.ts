export const SEARCH_HISTORY_STORAGE_KEY = 'personal-ledger-search-history';

export const normalizeSearchHistory = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((term): term is string => typeof term === 'string')
    .map(term => term.trim()).filter(Boolean))].slice(0, 10);
};

export const prependSearchHistory = (history: unknown, term: string): string[] =>
  normalizeSearchHistory([term, ...normalizeSearchHistory(history)]);

// The device key is authoritative, including an explicitly cleared [] value.
// Migrate existing settings history once, before receiving cloud settings.
export const readDeviceSearchHistory = (legacyHistory: unknown = []): string[] => {
  if (typeof localStorage === 'undefined') return normalizeSearchHistory(legacyHistory);
  const stored = localStorage.getItem(SEARCH_HISTORY_STORAGE_KEY);
  if (stored !== null) {
    try { return normalizeSearchHistory(JSON.parse(stored)); }
    catch { return []; }
  }
  const history = normalizeSearchHistory(legacyHistory);
  localStorage.setItem(SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(history));
  return history;
};

export const saveDeviceSearchHistory = (history: unknown): string[] => {
  const normalized = normalizeSearchHistory(history);
  localStorage.setItem(SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
};
