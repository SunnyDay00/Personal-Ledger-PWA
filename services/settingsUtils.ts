import { DEFAULT_SETTINGS } from '../constants';
import { AppSettings, AutoRecordRule, AutoRecordSchedule, HomeQuickAction, TransactionType } from '../types';
import { normalizeAiConfig } from './aiConfig';

const BACKUP_REMINDER_MIN_DAYS = 0;
const BACKUP_REMINDER_MAX_DAYS = 60;
const BACKUP_INTERVAL_MIN_DAYS = 1;
const BACKUP_INTERVAL_MAX_DAYS = 60;

export const SYNCABLE_SETTINGS_KEYS: (keyof AppSettings)[] = [
  'themeMode',
  'customThemeColor',
  'enableAnimations',
  'enableSound',
  'enableHaptics',
  'hapticStrength',
  'fontContrast',
  'webdavUrl',
  'webdavUser',
  'webdavPass',
  'enableCloudSync',
  'backupReminderDays',
  'backupAutoEnabled',
  'backupIntervalDays',
  'syncDebounceSeconds',
  'versionCheckIntervalFg',
  'versionCheckIntervalBg',
  'budget',
  'keypadHeight',
  'categoryRows',
  'imageCacheLimit',
  'categoryNotes',
  'searchHistory',
  'exportStartDate',
  'exportEndDate',
  'defaultLedgerId',
  'homeQuickActions',
  'autoRecords',
  'aiConfig',
];

export const getSyncableSettings = (settings: AppSettings): Partial<AppSettings> => {
  const syncable: Partial<AppSettings> = {};
  for (const key of SYNCABLE_SETTINGS_KEYS) {
    if (settings[key] !== undefined) {
      (syncable as Record<string, unknown>)[key] = settings[key];
    }
  }
  return syncable;
};

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

const normalizeClockTime = (value: unknown, fallback = '08:00'): string => {
  const raw = String(value || '').trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(raw) ? raw : fallback;
};

const normalizeAutoRecordSchedule = (value: unknown): AutoRecordSchedule => {
  const raw = (value || {}) as Partial<AutoRecordSchedule> & Record<string, unknown>;
  const kind = raw.kind === 'weekly' || raw.kind === 'monthly' ? raw.kind : 'daily';
  const time = normalizeClockTime(raw.time);

  if (kind === 'weekly') {
    const weekdays = Array.isArray(raw.weekdays)
      ? Array.from(new Set(raw.weekdays.map(day => Number(day)).filter(day => Number.isInteger(day) && day >= 0 && day <= 6))).sort((a, b) => a - b)
      : [];
    return { kind, time, weekdays: weekdays.length > 0 ? weekdays : [1] };
  }

  if (kind === 'monthly') {
    const day = Number(raw.dayOfMonth);
    const dayOfMonth = Number.isInteger(day) ? Math.min(31, Math.max(1, day)) : 1;
    return { kind, time, dayOfMonth };
  }

  return { kind, time };
};

const normalizeAutoRecords = (value: unknown): AutoRecordRule[] => {
  if (!Array.isArray(value)) return [];
  const now = Date.now();
  return value
    .map((item, index) => {
      const raw = item as Partial<AutoRecordRule> & Record<string, unknown>;
      const id = String(raw.id || `auto_record_${now}_${index}`).trim();
      const name = String(raw.name || '').trim();
      const icon = String(raw.icon || 'Circle').trim() || 'Circle';
      const ledgerId = String(raw.ledgerId || '').trim();
      const categoryId = String(raw.categoryId || '').trim();
      const type: TransactionType = raw.type === 'income' ? 'income' : 'expense';
      const amount = Number(raw.amount);
      const createdAt = Number(raw.createdAt);
      const updatedAt = Number(raw.updatedAt);
      const lastRunAt = Number(raw.lastRunAt);

      return {
        id,
        name,
        icon,
        enabled: raw.enabled !== false,
        ledgerId,
        type,
        categoryId,
        amount,
        schedule: normalizeAutoRecordSchedule(raw.schedule),
        createdAt: Number.isFinite(createdAt) && createdAt > 0 ? createdAt : now,
        updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : undefined,
        lastRunAt: Number.isFinite(lastRunAt) && lastRunAt > 0 ? lastRunAt : undefined,
      };
    })
    .filter(item => item.id && item.name && item.ledgerId && item.categoryId && Number.isFinite(item.amount) && item.amount > 0)
    .sort((a, b) => a.createdAt - b.createdAt);
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
    autoRecords: normalizeAutoRecords(merged.autoRecords),
    aiConfig: normalizeAiConfig(merged.aiConfig, baseSettings.aiConfig),
  };
};
