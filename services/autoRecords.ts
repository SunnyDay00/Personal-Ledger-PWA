import { AutoRecordRule, AutoRecordSchedule, Category, Ledger, Transaction } from '../types';
import { isTradingLedger } from './ledgerUtils';

export const AUTO_RECORD_CATCH_UP_LIMIT = 366;

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const pad2 = (value: number) => String(value).padStart(2, '0');

const parseTime = (time: string) => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  return {
    hours: match ? Number(match[1]) : 8,
    minutes: match ? Number(match[2]) : 0,
  };
};

const createLocalDate = (year: number, month: number, day: number, schedule: AutoRecordSchedule) => {
  const { hours, minutes } = parseTime(schedule.time);
  return new Date(year, month, day, hours, minutes, 0, 0);
};

const createScheduledDateForDay = (day: Date, schedule: AutoRecordSchedule) =>
  createLocalDate(day.getFullYear(), day.getMonth(), day.getDate(), schedule);

const addDays = (date: Date, days: number, schedule: AutoRecordSchedule) =>
  createLocalDate(date.getFullYear(), date.getMonth(), date.getDate() + days, schedule);

const addMonths = (date: Date, months: number, schedule: AutoRecordSchedule) => {
  const day = Math.min(schedule.dayOfMonth || 1, new Date(date.getFullYear(), date.getMonth() + months + 1, 0).getDate());
  return createLocalDate(date.getFullYear(), date.getMonth() + months, day, schedule);
};

const formatDateKey = (date: Date) =>
  `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;

export const createAutoRecordTransactionId = (ruleId: string, occurrenceAt: number) =>
  `auto_${ruleId}_${formatDateKey(new Date(occurrenceAt))}`;

export const isAutoRecordRunnable = (
  rule: AutoRecordRule,
  ledgers: Ledger[],
  categories: Category[]
) => {
  const ledger = ledgers.find(item => item.id === rule.ledgerId && !item.isDeleted);
  if (!ledger || isTradingLedger(ledger)) return false;

  return categories.some(category =>
    category.id === rule.categoryId &&
    category.ledgerId === rule.ledgerId &&
    category.type === rule.type &&
    !category.isDeleted
  );
};

export const getDueAutoRecordOccurrences = (
  rule: AutoRecordRule,
  now: number = Date.now(),
  limit: number = AUTO_RECORD_CATCH_UP_LIMIT
) => {
  if (!rule.enabled || limit <= 0) return [];

  const anchor = Math.max(Number(rule.createdAt || 0), Number(rule.lastRunAt || 0));
  if (!anchor || anchor > now) return [];

  const due: number[] = [];
  const anchorDate = new Date(anchor);
  const schedule = rule.schedule;

  if (schedule.kind === 'monthly') {
    let candidate = addMonths(anchorDate, 0, schedule);
    if (candidate.getTime() <= anchor) candidate = addMonths(candidate, 1, schedule);

    while (candidate.getTime() <= now && due.length < limit) {
      due.push(candidate.getTime());
      candidate = addMonths(candidate, 1, schedule);
    }
    return due;
  }

  if (schedule.kind === 'weekly') {
    const weekdays = new Set((schedule.weekdays?.length ? schedule.weekdays : [1]).filter(day => day >= 0 && day <= 6));
    let candidate = createScheduledDateForDay(anchorDate, schedule);
    let guard = 0;

    while (candidate.getTime() <= now && due.length < limit && guard < limit * 8) {
      if (candidate.getTime() > anchor && weekdays.has(candidate.getDay())) {
        due.push(candidate.getTime());
      }
      candidate = addDays(candidate, 1, schedule);
      guard += 1;
    }
    return due;
  }

  let candidate = createScheduledDateForDay(anchorDate, schedule);
  if (candidate.getTime() <= anchor) candidate = addDays(candidate, 1, schedule);

  while (candidate.getTime() <= now && due.length < limit) {
    due.push(candidate.getTime());
    candidate = addDays(candidate, 1, schedule);
  }
  return due;
};

export const createAutoRecordTransaction = (
  rule: AutoRecordRule,
  occurrenceAt: number,
  createdAt: number = Date.now()
): Transaction => ({
  id: createAutoRecordTransactionId(rule.id, occurrenceAt),
  ledgerId: rule.ledgerId,
  amount: rule.amount,
  type: rule.type,
  categoryId: rule.categoryId,
  date: occurrenceAt,
  note: rule.name,
  attachments: [],
  createdAt,
  isDeleted: false,
});

export const getAutoRecordScheduleLabel = (schedule: AutoRecordSchedule) => {
  if (schedule.kind === 'weekly') {
    const days = (schedule.weekdays?.length ? schedule.weekdays : [1])
      .filter(day => day >= 0 && day <= 6)
      .map(day => WEEKDAY_LABELS[day])
      .join('、');
    return `每周${days} ${schedule.time}`;
  }

  if (schedule.kind === 'monthly') {
    return `每月${schedule.dayOfMonth || 1}日 ${schedule.time}`;
  }

  return `每天 ${schedule.time}`;
};
