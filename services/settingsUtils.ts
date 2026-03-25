import { DEFAULT_SETTINGS } from '../constants';
import { AppSettings } from '../types';

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

export const normalizeAppSettings = (
  settings?: Partial<AppSettings> | null,
  baseSettings: AppSettings = DEFAULT_SETTINGS
): AppSettings => {
  const merged = { ...baseSettings, ...(settings || {}) };

  return {
    ...merged,
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
  };
};
