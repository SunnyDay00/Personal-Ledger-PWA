import {
  endOfDay,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subYears,
} from 'date-fns';
import { AppState, Category, CategoryGroup, Ledger, Transaction } from '../types';
import { dbAPI } from './db';
import { formatDisplayCurrency } from '../utils';
import { getTradeInventory, getTradingRealizedResult, isTradingLedger } from './ledgerUtils';

export const AI_DATE_PRESETS = [
  'all',
  'last_15_days',
  'last_6_months',
  'last_12_months',
  'this_week',
  'this_month',
  'this_year',
] as const;

type DatePreset = typeof AI_DATE_PRESETS[number];
type LedgerScope = 'default' | 'all';
type TransactionKind = 'all' | 'expense' | 'income' | 'buy' | 'sell';
type GroupBy = 'none' | 'day' | 'week' | 'month' | 'year' | 'ledger' | 'type' | 'category' | 'category_group';

interface CommonToolArgs {
  ledger_scope?: LedgerScope;
  ledger_names?: string[];
  date_preset?: DatePreset;
  start_date?: string;
  end_date?: string;
  transaction_kind?: TransactionKind;
  category_names?: string[];
  category_group_names?: string[];
  note_keyword?: string;
  min_amount_cny?: number;
  max_amount_cny?: number;
}

interface AnalyticsContext {
  state: AppState;
  defaultLedgerId: string;
  now?: Date;
}

interface ResolvedContext {
  ledgers: Ledger[];
  categories: Category[];
  groups: CategoryGroup[];
  startTime: number;
  endTime: number;
  dateLabel: string;
  transactions: Transaction[];
  filterLabels: string[];
}

const MAX_DETAIL_ROWS = 50;
const MAX_BUCKETS = 100;

const enumValues = <T extends readonly string[]>(values: T, value: unknown, fallback: T[number]): T[number] =>
  typeof value === 'string' && values.includes(value as T[number]) ? value as T[number] : fallback;

const parseDateBoundary = (value: unknown, end: boolean): number | undefined => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return (end ? endOfDay(parsed) : startOfDay(parsed)).getTime();
};

export const resolveAiDateRange = (
  args: Pick<CommonToolArgs, 'date_preset' | 'start_date' | 'end_date'>,
  now = new Date()
) => {
  const explicitStart = parseDateBoundary(args.start_date, false);
  const explicitEnd = parseDateBoundary(args.end_date, true);
  if (explicitStart !== undefined || explicitEnd !== undefined) {
    const startTime = explicitStart ?? Number.NEGATIVE_INFINITY;
    const endTime = explicitEnd ?? endOfDay(now).getTime();
    if (startTime > endTime) throw new Error('开始日期不能晚于结束日期');
    return {
      startTime,
      endTime,
      label: `${explicitStart === undefined ? '最早记录' : format(startTime, 'yyyy-MM-dd')} 至 ${format(endTime, 'yyyy-MM-dd')}`,
    };
  }

  const preset = enumValues(AI_DATE_PRESETS, args.date_preset, 'all');
  let startTime = Number.NEGATIVE_INFINITY;
  let endTime = endOfDay(now).getTime();
  if (preset === 'last_15_days') startTime = startOfDay(subDays(now, 14)).getTime();
  if (preset === 'last_6_months') startTime = startOfDay(subMonths(now, 6)).getTime();
  if (preset === 'last_12_months') startTime = startOfDay(subYears(now, 1)).getTime();
  if (preset === 'this_week') {
    startTime = startOfWeek(now, { weekStartsOn: 1 }).getTime();
  }
  if (preset === 'this_month') {
    startTime = startOfMonth(now).getTime();
  }
  if (preset === 'this_year') {
    startTime = startOfYear(now).getTime();
  }
  const labels: Record<DatePreset, string> = {
    all: '全部时间',
    last_15_days: '最近15个自然日',
    last_6_months: '最近6个自然月',
    last_12_months: '最近12个自然月',
    this_week: '本周',
    this_month: '本月',
    this_year: '今年',
  };
  return { startTime, endTime, label: labels[preset] };
};

const normalizeNames = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(item => String(item).trim()).filter(Boolean).slice(0, 20) : [];

const resolveNamedItems = <T extends { name: string }>(
  requested: string[],
  available: T[],
  typeLabel: string
): T[] => {
  if (requested.length === 0) return available;
  const selected: T[] = [];
  for (const rawName of requested) {
    const name = rawName.toLocaleLowerCase('zh-CN');
    const exact = available.filter(item => item.name.toLocaleLowerCase('zh-CN') === name);
    const matches = exact.length > 0
      ? exact
      : available.filter(item => item.name.toLocaleLowerCase('zh-CN').includes(name));
    if (matches.length === 0) throw new Error(`没有找到${typeLabel}“${rawName}”`);
    if (matches.length > 1) {
      throw new Error(`${typeLabel}“${rawName}”有多个匹配项：${matches.map(item => item.name).join('、')}`);
    }
    if (!selected.includes(matches[0])) selected.push(matches[0]);
  }
  return selected;
};

const resolveLedgerSelection = (args: CommonToolArgs, state: AppState, defaultLedgerId: string): Ledger[] => {
  const active = state.ledgers.filter(ledger => !ledger.isDeleted);
  const requestedNames = normalizeNames(args.ledger_names);
  if (requestedNames.length > 0) return resolveNamedItems(requestedNames, active, '账本');
  if (args.ledger_scope === 'all') return active;
  const selected = active.find(ledger => ledger.id === defaultLedgerId);
  if (!selected) throw new Error('该对话绑定的账本已不存在，请新建对话后重试');
  return [selected];
};

const getTransactionKind = (transaction: Transaction, ledger?: Ledger): Exclude<TransactionKind, 'all'> => {
  if (isTradingLedger(ledger)) {
    return (transaction.tradeAction || (transaction.type === 'income' ? 'sell' : 'buy')) as 'buy' | 'sell';
  }
  return transaction.type;
};

const getCategoryGroup = (groups: CategoryGroup[], categoryId: string) =>
  groups.find(group => !group.isDeleted && group.categoryIds.includes(categoryId));

const resolveContext = async (rawArgs: unknown, context: AnalyticsContext): Promise<ResolvedContext> => {
  const args = (rawArgs || {}) as CommonToolArgs;
  const ledgers = resolveLedgerSelection(args, context.state, context.defaultLedgerId);
  const ledgerIds = new Set(ledgers.map(ledger => ledger.id));
  const allCategories = await dbAPI.getAllCategoriesIncludingDeleted();
  const allGroups = await dbAPI.getAllCategoryGroupsIncludingDeleted();
  const categories = allCategories.filter(category => category.ledgerId && ledgerIds.has(category.ledgerId));
  const groups = allGroups.filter(group => group.ledgerId && ledgerIds.has(group.ledgerId));
  const activeCategories = categories.filter(category => !category.isDeleted);
  const activeGroups = groups.filter(group => !group.isDeleted);
  const categoryNames = normalizeNames(args.category_names);
  const groupNames = normalizeNames(args.category_group_names);
  const selectedCategories = resolveNamedItems(categoryNames, activeCategories, '分类');
  const selectedGroups = resolveNamedItems(groupNames, activeGroups, '分类组');
  const categoryIds = new Set(selectedCategories.map(category => category.id));
  const groupCategoryIds = new Set(selectedGroups.flatMap(group => group.categoryIds));
  const dateRange = resolveAiDateRange(args, context.now);
  const transactionKind = enumValues(['all', 'expense', 'income', 'buy', 'sell'] as const, args.transaction_kind, 'all');
  const noteKeyword = typeof args.note_keyword === 'string' ? args.note_keyword.trim().toLocaleLowerCase('zh-CN') : '';
  const minAmount = typeof args.min_amount_cny === 'number' ? args.min_amount_cny : Number.NaN;
  const maxAmount = typeof args.max_amount_cny === 'number' ? args.max_amount_cny : Number.NaN;

  const transactions = context.state.transactions.filter(transaction => {
    if (transaction.isDeleted || !ledgerIds.has(transaction.ledgerId)) return false;
    if (transaction.date < dateRange.startTime || transaction.date > dateRange.endTime) return false;
    const ledger = ledgers.find(item => item.id === transaction.ledgerId);
    if (transactionKind !== 'all' && getTransactionKind(transaction, ledger) !== transactionKind) return false;
    if (categoryNames.length > 0 && !categoryIds.has(transaction.categoryId)) return false;
    if (groupNames.length > 0 && !groupCategoryIds.has(transaction.categoryId)) return false;
    if (noteKeyword && !transaction.note.toLocaleLowerCase('zh-CN').includes(noteKeyword)) return false;
    if (Number.isFinite(minAmount) && transaction.amount < minAmount) return false;
    if (Number.isFinite(maxAmount) && transaction.amount > maxAmount) return false;
    return true;
  });

  const filterLabels: string[] = [];
  if (transactionKind !== 'all') filterLabels.push(`类型：${transactionKind}`);
  if (categoryNames.length > 0) filterLabels.push(`分类：${selectedCategories.map(item => item.name).join('、')}`);
  if (groupNames.length > 0) filterLabels.push(`分类组：${selectedGroups.map(item => item.name).join('、')}`);
  if (noteKeyword) filterLabels.push(`备注包含：${args.note_keyword}`);
  if (Number.isFinite(minAmount)) filterLabels.push(`最低金额：¥${minAmount}`);
  if (Number.isFinite(maxAmount)) filterLabels.push(`最高金额：¥${maxAmount}`);

  return {
    ledgers,
    categories,
    groups,
    startTime: dateRange.startTime,
    endTime: dateRange.endTime,
    dateLabel: dateRange.label,
    transactions,
    filterLabels,
  };
};

const amountPresentation = (amountCny: number, ledger: Ledger | undefined, state: AppState) => ({
  amount_cny: Math.round(amountCny * 100) / 100,
  display_amount: formatDisplayCurrency(amountCny, ledger, state.exchangeRates),
  display_currency: ledger?.displayCurrency || 'CNY',
});

const createTrace = (tool: string, label: string, resolved: ResolvedContext, recordCount?: number, truncated?: boolean) => ({
  tool,
  label,
  ledger_names: resolved.ledgers.map(ledger => ledger.name),
  date_range: `${resolved.dateLabel}（${Number.isFinite(resolved.startTime) ? format(resolved.startTime, 'yyyy-MM-dd') : '最早记录'} 至 ${format(resolved.endTime, 'yyyy-MM-dd')}）`,
  filters: resolved.filterLabels,
  record_count: recordCount,
  truncated: !!truncated,
});

const bucketKey = (
  groupBy: GroupBy,
  transaction: Transaction,
  ledger: Ledger | undefined,
  category: Category | undefined,
  group: CategoryGroup | undefined
) => {
  const date = new Date(transaction.date);
  if (groupBy === 'day') return format(date, 'yyyy-MM-dd');
  if (groupBy === 'week') return format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  if (groupBy === 'month') return format(date, 'yyyy-MM');
  if (groupBy === 'year') return format(date, 'yyyy');
  if (groupBy === 'ledger') return ledger?.name || '未知账本';
  if (groupBy === 'type') return getTransactionKind(transaction, ledger);
  if (groupBy === 'category') return category?.name || '未知分类';
  if (groupBy === 'category_group') return group?.name || '未分组';
  return '总计';
};

export const executeAiTool = async (name: string, rawArgs: unknown, context: AnalyticsContext) => {
  if (name === 'get_ledger_catalog') {
    const resolved = await resolveContext(rawArgs, context);
    return {
      trace: createTrace(name, '读取账本与分类目录', resolved),
      ledgers: resolved.ledgers.map(ledger => ({
        name: ledger.name,
        type: isTradingLedger(ledger) ? 'trading' : 'accounting',
        display_currency: ledger.displayCurrency || 'CNY',
        categories: resolved.categories
          .filter(category => category.ledgerId === ledger.id && !category.isDeleted)
          .map(category => category.name),
        category_groups: resolved.groups
          .filter(group => group.ledgerId === ledger.id && !group.isDeleted)
          .map(group => ({ name: group.name, categories: group.categoryIds
            .map(id => resolved.categories.find(category => category.id === id)?.name)
            .filter(Boolean) })),
      })),
    };
  }

  if (name === 'find_transactions') {
    const args = (rawArgs || {}) as CommonToolArgs & {
      order_by?: 'amount' | 'date';
      order_direction?: 'asc' | 'desc';
      limit?: number;
      include_notes?: boolean;
    };
    const resolved = await resolveContext(args, context);
    const orderBy = args.order_by === 'date' ? 'date' : 'amount';
    const direction = args.order_direction === 'asc' ? 'asc' : 'desc';
    const limit = Math.min(MAX_DETAIL_ROWS, Math.max(1, Math.trunc(Number(args.limit) || 10)));
    const sorted = [...resolved.transactions].sort((a, b) => {
      const delta = orderBy === 'date' ? a.date - b.date : a.amount - b.amount;
      return direction === 'asc' ? delta : -delta;
    });
    const topAmount = sorted[0]?.amount;
    const tieCount = orderBy === 'amount' && topAmount !== undefined
      ? sorted.filter(transaction => transaction.amount === topAmount).length
      : undefined;
    const rows = sorted.slice(0, limit).map(transaction => {
      const ledger = resolved.ledgers.find(item => item.id === transaction.ledgerId);
      const category = resolved.categories.find(item => item.id === transaction.categoryId);
      const group = getCategoryGroup(resolved.groups, transaction.categoryId);
      return {
        id: transaction.id,
        ledger: ledger?.name || '未知账本',
        date: format(transaction.date, 'yyyy-MM-dd HH:mm'),
        kind: getTransactionKind(transaction, ledger),
        category: category ? `${category.name}${category.isDeleted ? '（已删除）' : ''}` : '未知分类',
        category_group: group?.name || '未分组',
        ...amountPresentation(transaction.amount, ledger, context.state),
        original_amount: transaction.originalAmount,
        original_currency: transaction.currencyCode,
        note: args.include_notes || args.note_keyword ? transaction.note : undefined,
      };
    });
    return {
      trace: createTrace(name, '查询交易明细', resolved, resolved.transactions.length, sorted.length > limit),
      total_matches: resolved.transactions.length,
      returned: rows.length,
      truncated: sorted.length > limit,
      tie_count_at_top: tieCount,
      rows,
    };
  }

  if (name === 'aggregate_transactions') {
    const args = (rawArgs || {}) as CommonToolArgs & { group_by?: GroupBy };
    const resolved = await resolveContext(args, context);
    const groupBy = enumValues(
      ['none', 'day', 'week', 'month', 'year', 'ledger', 'type', 'category', 'category_group'] as const,
      args.group_by,
      'none'
    );
    const buckets = new Map<string, { amount: number; count: number; income: number; expense: number }>();
    resolved.transactions.forEach(transaction => {
      const ledger = resolved.ledgers.find(item => item.id === transaction.ledgerId);
      const category = resolved.categories.find(item => item.id === transaction.categoryId);
      const group = getCategoryGroup(resolved.groups, transaction.categoryId);
      const key = bucketKey(groupBy, transaction, ledger, category, group);
      const current = buckets.get(key) || { amount: 0, count: 0, income: 0, expense: 0 };
      current.amount += transaction.amount;
      current.count += 1;
      if (!isTradingLedger(ledger)) {
        if (transaction.type === 'income') current.income += transaction.amount;
        else current.expense += transaction.amount;
      }
      buckets.set(key, current);
    });
    const rows = Array.from(buckets.entries())
      .map(([label, value]) => ({
        label,
        count: value.count,
        amount_cny: Math.round(value.amount * 100) / 100,
        average_cny: value.count ? Math.round((value.amount / value.count) * 100) / 100 : 0,
        income_cny: Math.round(value.income * 100) / 100,
        expense_cny: Math.round(value.expense * 100) / 100,
        net_cny: Math.round((value.income - value.expense) * 100) / 100,
      }))
      .sort((a, b) => groupBy === 'day' || groupBy === 'week' || groupBy === 'month' || groupBy === 'year'
        ? a.label.localeCompare(b.label)
        : b.amount_cny - a.amount_cny);
    const accountingTransactions = resolved.transactions.filter(transaction => {
      const ledger = resolved.ledgers.find(item => item.id === transaction.ledgerId);
      return !isTradingLedger(ledger);
    });
    const tradingTransactions = resolved.transactions.filter(transaction => {
      const ledger = resolved.ledgers.find(item => item.id === transaction.ledgerId);
      return isTradingLedger(ledger);
    });
    const total = resolved.transactions.reduce((sum, transaction) => sum + transaction.amount, 0);
    const income = accountingTransactions.filter(item => item.type === 'income').reduce((sum, item) => sum + item.amount, 0);
    const expense = accountingTransactions.filter(item => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0);
    const tradingBuy = tradingTransactions
      .filter(transaction => {
        const ledger = resolved.ledgers.find(item => item.id === transaction.ledgerId);
        return getTransactionKind(transaction, ledger) === 'buy';
      })
      .reduce((sum, item) => sum + item.amount, 0);
    const tradingSell = tradingTransactions
      .filter(transaction => {
        const ledger = resolved.ledgers.find(item => item.id === transaction.ledgerId);
        return getTransactionKind(transaction, ledger) === 'sell';
      })
      .reduce((sum, item) => sum + item.amount, 0);
    const mixesLedgerTypes = accountingTransactions.length > 0 && tradingTransactions.length > 0;
    return {
      trace: createTrace(name, `聚合统计（${groupBy}）`, resolved, resolved.transactions.length, rows.length > MAX_BUCKETS),
      calculation_currency: 'CNY',
      mixed_ledger_types: mixesLedgerTypes,
      total: {
        count: resolved.transactions.length,
        amount_cny: mixesLedgerTypes ? null : Math.round(total * 100) / 100,
        average_cny: mixesLedgerTypes
          ? null
          : resolved.transactions.length ? Math.round((total / resolved.transactions.length) * 100) / 100 : 0,
        maximum_cny: resolved.transactions.length ? Math.max(...resolved.transactions.map(item => item.amount)) : 0,
        minimum_cny: resolved.transactions.length ? Math.min(...resolved.transactions.map(item => item.amount)) : 0,
        income_cny: Math.round(income * 100) / 100,
        expense_cny: Math.round(expense * 100) / 100,
        net_cny: Math.round((income - expense) * 100) / 100,
      },
      accounting_summary: {
        count: accountingTransactions.length,
        income_cny: Math.round(income * 100) / 100,
        expense_cny: Math.round(expense * 100) / 100,
        net_cny: Math.round((income - expense) * 100) / 100,
      },
      trading_summary: {
        count: tradingTransactions.length,
        buy_amount_cny: Math.round(tradingBuy * 100) / 100,
        sell_amount_cny: Math.round(tradingSell * 100) / 100,
        note: '买入与卖出金额不等同普通记账本的支出与收入，利润请调用 get_trading_summary',
      },
      groups: rows.slice(0, MAX_BUCKETS),
      truncated: rows.length > MAX_BUCKETS,
      per_ledger: resolved.ledgers.map(ledger => {
        const ledgerTransactions = resolved.transactions.filter(transaction => transaction.ledgerId === ledger.id);
        const ledgerTotal = ledgerTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);
        return {
          ledger: ledger.name,
          ledger_type: isTradingLedger(ledger) ? 'trading' : 'accounting',
          count: ledgerTransactions.length,
          ...amountPresentation(ledgerTotal, ledger, context.state),
        };
      }),
    };
  }

  if (name === 'get_trading_summary') {
    const resolved = await resolveContext(rawArgs, context);
    const tradingLedgers = resolved.ledgers.filter(isTradingLedger);
    const summaries = tradingLedgers.map(ledger => {
      const ledgerTransactions = context.state.transactions.filter(transaction =>
        !transaction.isDeleted && transaction.ledgerId === ledger.id
      );
      const periodTransactions = resolved.transactions.filter(transaction => transaction.ledgerId === ledger.id);
      const realized = getTradingRealizedResult(
        ledgerTransactions,
        ledger.id,
        resolved.startTime,
        resolved.endTime
      );
      const categories = resolved.categories.filter(category => category.ledgerId === ledger.id && !category.isDeleted);
      return {
        ledger: ledger.name,
        buy_count: periodTransactions.filter(transaction => getTransactionKind(transaction, ledger) === 'buy').length,
        sell_count: periodTransactions.filter(transaction => getTransactionKind(transaction, ledger) === 'sell').length,
        realized: {
          revenue: amountPresentation(realized.revenue, ledger, context.state),
          cost: amountPresentation(realized.cost, ledger, context.state),
          profit: amountPresentation(realized.profit, ledger, context.state),
        },
        inventory: categories.map(category => ({
          category: category.name,
          quantity: getTradeInventory(ledgerTransactions, ledger.id, category.id),
        })).filter(item => item.quantity !== 0),
      };
    });
    return {
      trace: createTrace(name, '买卖本统计', resolved, resolved.transactions.length),
      summaries,
      note: summaries.length === 0 ? '当前范围没有买卖本' : undefined,
    };
  }

  throw new Error(`不支持的只读工具：${name}`);
};

export const AI_TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'get_ledger_catalog',
      description: '读取可查询的账本、分类、分类组和币种目录。需要确认名称或范围时使用。',
      parameters: {
        type: 'object',
        properties: {
          ledger_scope: { type: 'string', enum: ['default', 'all'] },
          ledger_names: { type: 'array', items: { type: 'string' }, maxItems: 20 },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_transactions',
      description: '查询交易明细，适合最高/最低一次、具体记录、备注搜索。最多返回50条。',
      parameters: {
        type: 'object',
        properties: {
          ledger_scope: { type: 'string', enum: ['default', 'all'] },
          ledger_names: { type: 'array', items: { type: 'string' }, maxItems: 20 },
          date_preset: { type: 'string', enum: AI_DATE_PRESETS },
          start_date: { type: 'string', description: 'YYYY-MM-DD' },
          end_date: { type: 'string', description: 'YYYY-MM-DD' },
          transaction_kind: { type: 'string', enum: ['all', 'expense', 'income', 'buy', 'sell'] },
          category_names: { type: 'array', items: { type: 'string' }, maxItems: 20 },
          category_group_names: { type: 'array', items: { type: 'string' }, maxItems: 20 },
          note_keyword: { type: 'string' },
          min_amount_cny: { type: 'number' },
          max_amount_cny: { type: 'number' },
          order_by: { type: 'string', enum: ['amount', 'date'] },
          order_direction: { type: 'string', enum: ['asc', 'desc'] },
          limit: { type: 'integer', minimum: 1, maximum: 50 },
          include_notes: { type: 'boolean' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'aggregate_transactions',
      description: '确定性统计交易的合计、数量、平均、最大、最小、净额和分组结果。',
      parameters: {
        type: 'object',
        properties: {
          ledger_scope: { type: 'string', enum: ['default', 'all'] },
          ledger_names: { type: 'array', items: { type: 'string' }, maxItems: 20 },
          date_preset: { type: 'string', enum: AI_DATE_PRESETS },
          start_date: { type: 'string', description: 'YYYY-MM-DD' },
          end_date: { type: 'string', description: 'YYYY-MM-DD' },
          transaction_kind: { type: 'string', enum: ['all', 'expense', 'income', 'buy', 'sell'] },
          category_names: { type: 'array', items: { type: 'string' }, maxItems: 20 },
          category_group_names: { type: 'array', items: { type: 'string' }, maxItems: 20 },
          note_keyword: { type: 'string' },
          min_amount_cny: { type: 'number' },
          max_amount_cny: { type: 'number' },
          group_by: {
            type: 'string',
            enum: ['none', 'day', 'week', 'month', 'year', 'ledger', 'type', 'category', 'category_group'],
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_trading_summary',
      description: '查询买卖本的买卖次数、已实现收入/成本/利润和当前库存。',
      parameters: {
        type: 'object',
        properties: {
          ledger_scope: { type: 'string', enum: ['default', 'all'] },
          ledger_names: { type: 'array', items: { type: 'string' }, maxItems: 20 },
          date_preset: { type: 'string', enum: AI_DATE_PRESETS },
          start_date: { type: 'string', description: 'YYYY-MM-DD' },
          end_date: { type: 'string', description: 'YYYY-MM-DD' },
          category_names: { type: 'array', items: { type: 'string' }, maxItems: 20 },
        },
      },
    },
  },
] as const;
