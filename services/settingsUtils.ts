import { DEFAULT_SETTINGS } from '../constants';
import { AppSettings, HomeQuickAction, TransactionType } from '../types';

const BACKUP_REMINDER_MIN_DAYS = 0;
const BACKUP_REMINDER_MAX_DAYS = 60;
const BACKUP_INTERVAL_MIN_DAYS = 1;
const BACKUP_INTERVAL_MAX_DAYS = 60;

const clampInteger = (value: unknown, min: number, max: number, fallback: number): number => {
  const parsed = typeof value === 'string' && value.trim() === '' ? Number.NaN : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
};

export const normalizeBackupReminderDays = (
  value: unknown,
  fallback: number = DEFAULT_SETTINGS.backupReminderDays ?? 7
): number => clampInteger(value, BACKUP_REMINDER_MIN_DAYS, BACKUP_REMINDER_MAX_DAYS, fallback);

export const normalizeBackupIntervalDays = (
  value: unknown,
  fallback: number = DEFAULT_SETTINGS.backupIntervalDays ?? 7
): number => clampInteger(value, BACKUP_INTERVAL_MIN_DAYS, BACKUP_INTERVAL_MAX_DAYS, fallback);

export const normalizeBackupAutoEnabled = (
  value: unknown,
  fallback: boolean = DEFAULT_SETTINGS.backupAutoEnabled ?? false
): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value === 'true') return true;
    if (value === 'false') return false;
  }
  if (typeof value === 'number') return value !== 0;
  return fallback;
};

const normalizeHomeQuickActions = (value: unknown): HomeQuickAction[] => {
  if (!Array.isArray(value)) return [];
  const now = Date.now();
  return value
    .map((item, index) => {
      const raw = item as Partial<HomeQuickAction> & Record<string, unknown>;
      const id = String(raw.id || `quick_${now}_${index}`).trim();
      const ledgerId = String(raw.ledgerId || '').trim();
      const type: TransactionType = raw.type === 'income' ? 'income' : 'expense';
      const title = String(raw.title || '').trim();
      const order = Number.isFinite(Number(raw.order)) ? Number(raw.order) : index;
      const updatedAt = Number(raw.updatedAt);
      return {
        id,
        title,
        ledgerId,
        type,
        order,
        updatedAt: Number.isFinite(updatedAt) ? updatedAt : undefined,
      };
    })
    .filter(item => item.id && item.ledgerId)
    .sort((a, b) => a.order - b.order)
    .slice(0, 4)
    .map((item, index) => ({ ...item, order: index }));
};

export const normalizeAppSettings = (
  settings?: Partial<AppSettings> | null,
  baseSettings: AppSettings = DEFAULT_SETTINGS
): AppSettings => {
  const merged = { ...baseSettings, ...(settings || {}) };
  const now = Date.now();
  const authSession = merged.authSession && merged.authSession.token && merged.authSession.expiresAt > now
    ? merged.authSession
    : undefined;

  return {
    ...merged,
    authSession,
    authMode: authSession ? 'authenticated' : 'guest',
    backupReminderDays: normalizeBackupReminderDays(
      merged.backupReminderDays,
      baseSettings.backupReminderDays ?? DEFAULT_SETTINGS.backupReminderDays ?? 7
    ),
    backupAutoEnabled: normalizeBackupAutoEnabled(
      merged.backupAutoEnabled,
      baseSettings.backupAutoEnabled ?? DEFAULT_SETTINGS.backupAutoEnabled ?? false
    ),
    backupIntervalDays: normalizeBackupIntervalDays(
      merged.backupIntervalDays,
      baseSettings.backupIntervalDays ?? DEFAULT_SETTINGS.backupIntervalDays ?? 7
    ),
    homeQuickActions: normalizeHomeQuickActions(merged.homeQuickActions),
  };
};
