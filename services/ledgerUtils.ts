import { Category, CategoryType, Ledger, LedgerType, TradeAction, TradeAllocation, TradeItemType, TradeKey, TradeKeyAllocation, Transaction } from '../types';

export const normalizeLedgerType = (value: unknown): LedgerType =>
  value === 'trading' ? 'trading' : 'accounting';

export const normalizeCategoryType = (value: unknown): CategoryType => {
  if (value === 'income' || value === 'trade') return value;
  return 'expense';
};

export const normalizeTradeItemType = (value: unknown): TradeItemType =>
  value === 'cardKey' || value === 'card_key' ? 'cardKey' : 'normal';

export const normalizeTradeAction = (value: unknown): TradeAction | undefined => {
  if (value === 'buy' || value === 'sell') return value;
  return undefined;
};

const parseJsonArrayField = (value: unknown): any[] => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || value.trim() === '') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const normalizeTradeAllocations = (value: unknown): TradeAllocation[] | undefined => {
  const raw = parseJsonArrayField(value);

  const allocations = raw
    .map((item: any) => ({
      buyTransactionId: String(item?.buyTransactionId ?? item?.buy_transaction_id ?? item?.id ?? '').trim(),
      quantity: roundMoney(Number(item?.quantity ?? 0)),
    }))
    .filter(item => item.buyTransactionId && Number.isFinite(item.quantity) && item.quantity > 0);

  return allocations.length > 0 ? allocations : undefined;
};

export const normalizeTradeKeys = (value: unknown): TradeKey[] | undefined => {
  const keys = parseJsonArrayField(value)
    .map((item: any, index) => {
      const rawValue = String(item?.value ?? item?.key ?? item?.cardKey ?? '').trim();
      const rawId = item?.id ?? item?.keyId ?? item?.key_id ?? rawValue;
      return {
        id: String(rawId || `key-${index}`).trim(),
        value: rawValue,
      };
    })
    .filter(item => item.id && item.value);

  return keys.length > 0 ? keys : undefined;
};

export const normalizeTradeKeyAllocations = (value: unknown): TradeKeyAllocation[] | undefined => {
  const allocations = parseJsonArrayField(value)
    .map((item: any) => ({
      buyTransactionId: String(item?.buyTransactionId ?? item?.buy_transaction_id ?? '').trim(),
      keyId: String(item?.keyId ?? item?.key_id ?? item?.id ?? '').trim(),
      value: String(item?.value ?? item?.key ?? item?.cardKey ?? '').trim(),
    }))
    .filter(item => item.buyTransactionId && item.keyId && item.value);

  return allocations.length > 0 ? allocations : undefined;
};

export const isTradingLedger = (ledger?: Ledger | null) =>
  normalizeLedgerType(ledger?.ledgerType) === 'trading';

export const getLedgerTypeLabel = (ledger?: Ledger | null) =>
  isTradingLedger(ledger) ? '买卖本' : '记账本';

export const getTransactionTypeLabel = (ledger: Ledger | undefined | null, type: Transaction['type']) => {
  if (isTradingLedger(ledger)) return type === 'income' ? '卖出' : '买入';
  return type === 'income' ? '收入' : '支出';
};

export const normalizeLedger = <T extends Partial<Ledger> & Record<string, any>>(ledger: T): Ledger => ({
  ...ledger,
  id: ledger.id || '',
  name: ledger.name || '',
  themeColor: ledger.themeColor || ledger.theme_color || '#007AFF',
  ledgerType: normalizeLedgerType(ledger.ledgerType ?? ledger.ledger_type),
  createdAt: Number(ledger.createdAt ?? ledger.created_at ?? Date.now()),
  updatedAt: Number(ledger.updatedAt ?? ledger.updated_at ?? Date.now()),
  isDeleted: !!(ledger.isDeleted ?? ledger.is_deleted),
});

export const normalizeCategory = <T extends Partial<Category> & Record<string, any>>(category: T): Category => ({
  ...category,
  id: category.id || '',
  ledgerId: category.ledgerId ?? category.ledger_id,
  name: category.name || '',
  icon: category.icon || 'Circle',
  type: normalizeCategoryType(category.type),
  tradeItemType: normalizeTradeItemType(category.tradeItemType ?? category.trade_item_type),
  buyFeeRate: Number(category.buyFeeRate ?? category.buy_fee_rate ?? 0) || 0,
  sellFeeRate: Number(category.sellFeeRate ?? category.sell_fee_rate ?? 0) || 0,
  order: Number(category.order ?? 0),
  isCustom: !!(category.isCustom ?? category.is_custom),
  updatedAt: Number(category.updatedAt ?? category.updated_at ?? Date.now()),
  isDeleted: !!(category.isDeleted ?? category.is_deleted),
});

export const normalizeTransaction = <T extends Partial<Transaction> & Record<string, any>>(transaction: T): Transaction => ({
  ...transaction,
  id: transaction.id || '',
  ledgerId: transaction.ledgerId ?? transaction.ledger_id ?? '',
  amount: Number(transaction.amount || 0),
  type: transaction.type === 'income' ? 'income' : 'expense',
  categoryId: transaction.categoryId ?? transaction.category_id ?? '',
  tradeAction: normalizeTradeAction(transaction.tradeAction ?? transaction.trade_action),
  tradeQuantity: Number(transaction.tradeQuantity ?? transaction.trade_quantity ?? 0) || undefined,
  tradeGrossAmount: Number(transaction.tradeGrossAmount ?? transaction.trade_gross_amount ?? 0) || undefined,
  tradeFeeRate: Number(transaction.tradeFeeRate ?? transaction.trade_fee_rate ?? 0) || undefined,
  tradeFeeAmount: Number(transaction.tradeFeeAmount ?? transaction.trade_fee_amount ?? 0) || undefined,
  tradeAllocations: normalizeTradeAllocations(transaction.tradeAllocations ?? transaction.trade_allocations),
  tradeKeys: normalizeTradeKeys(transaction.tradeKeys ?? transaction.trade_keys),
  tradeKeyAllocations: normalizeTradeKeyAllocations(transaction.tradeKeyAllocations ?? transaction.trade_key_allocations),
  date: Number(transaction.date ?? Date.now()),
  note: transaction.note || '',
  attachments: Array.isArray(transaction.attachments)
    ? transaction.attachments
    : (() => {
        try { return JSON.parse(transaction.attachments || '[]'); } catch { return []; }
      })(),
  createdAt: Number(transaction.createdAt ?? transaction.created_at ?? transaction.date ?? Date.now()),
  updatedAt: Number(transaction.updatedAt ?? transaction.updated_at ?? transaction.date ?? Date.now()),
  isDeleted: !!(transaction.isDeleted ?? transaction.is_deleted),
});

export const getTradeInventory = (transactions: Transaction[], ledgerId: string, categoryId: string, excludeTransactionId?: string) =>
  transactions.reduce((quantity, transaction) => {
    if (
      transaction.isDeleted ||
      transaction.ledgerId !== ledgerId ||
      transaction.categoryId !== categoryId ||
      transaction.id === excludeTransactionId
    ) {
      return quantity;
    }

    const txQuantity = Number(transaction.tradeQuantity || 0);
    if (transaction.tradeAction === 'buy') return quantity + txQuantity;
    if (transaction.tradeAction === 'sell') return quantity - txQuantity;
    return quantity;
  }, 0);

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

type CostLot = {
  buyTransactionId: string;
  transaction: Transaction;
  originalQuantity: number;
  quantity: number;
  unitCost: number;
  unitFee: number;
};

export type TradeBuyLot = {
  buyTransactionId: string;
  transaction: Transaction;
  originalQuantity: number;
  remainingQuantity: number;
  unitCost: number;
  unitFee: number;
  totalUnitCost: number;
};

export type TradeCardKeyStockItem = {
  buyTransactionId: string;
  transaction: Transaction;
  keyId: string;
  value: string;
};

const removeFirstMatchingCardKey = (
  stock: TradeCardKeyStockItem[],
  predicate: (item: TradeCardKeyStockItem) => boolean
) => {
  const index = stock.findIndex(predicate);
  if (index !== -1) stock.splice(index, 1);
};

const consumeFirstCardKeys = (stock: TradeCardKeyStockItem[], quantity: number) => {
  const count = Math.max(0, Math.floor(Number(quantity || 0)));
  if (count > 0) stock.splice(0, count);
};

const createTradeCardKeyStock = (
  transactions: Transaction[],
  ledgerId: string,
  categoryId: string,
  excludeTransactionId?: string,
  endTime = Number.POSITIVE_INFINITY,
  endCreatedAt = Number.POSITIVE_INFINITY
) => {
  const stock: TradeCardKeyStockItem[] = [];

  transactions
    .filter(transaction =>
      !transaction.isDeleted &&
      transaction.ledgerId === ledgerId &&
      transaction.categoryId === categoryId &&
      transaction.id !== excludeTransactionId &&
      (
        transaction.date < endTime ||
        (transaction.date === endTime && Number(transaction.createdAt || 0) < endCreatedAt)
      )
    )
    .sort((a, b) => {
      if (a.date !== b.date) return a.date - b.date;
      return (a.createdAt || 0) - (b.createdAt || 0);
    })
    .forEach(transaction => {
      const tradeAction = transaction.tradeAction || (transaction.type === 'income' ? 'sell' : 'buy');
      if (tradeAction === 'buy') {
        normalizeTradeKeys(transaction.tradeKeys)?.forEach(key => {
          stock.push({
            buyTransactionId: transaction.id,
            transaction,
            keyId: key.id,
            value: key.value,
          });
        });
        return;
      }

      if (tradeAction !== 'sell') return;

      const keyAllocations = normalizeTradeKeyAllocations(transaction.tradeKeyAllocations);
      if (keyAllocations && keyAllocations.length > 0) {
        keyAllocations.forEach(allocation => {
          removeFirstMatchingCardKey(
            stock,
            item => item.buyTransactionId === allocation.buyTransactionId && item.keyId === allocation.keyId
          );
        });
        return;
      }

      consumeFirstCardKeys(stock, transaction.tradeQuantity || 0);
    });

  return stock;
};

export const getAvailableTradeCardKeys = (
  transactions: Transaction[],
  ledgerId: string,
  categoryId: string,
  excludeTransactionId?: string
): TradeCardKeyStockItem[] =>
  createTradeCardKeyStock(transactions, ledgerId, categoryId, excludeTransactionId);

export const getSuggestedTradeKeyAllocations = (
  transactions: Transaction[],
  ledgerId: string,
  categoryId: string,
  quantity: number,
  excludeTransactionId?: string
): TradeKeyAllocation[] => {
  const count = Math.max(0, Math.floor(Number(quantity || 0)));
  if (count <= 0) return [];

  return createTradeCardKeyStock(transactions, ledgerId, categoryId, excludeTransactionId)
    .slice(0, count)
    .map(item => ({
      buyTransactionId: item.buyTransactionId,
      keyId: item.keyId,
      value: item.value,
    }));
};

export const tradeKeyAllocationsToTradeAllocations = (allocations?: TradeKeyAllocation[]): TradeAllocation[] | undefined => {
  const normalized = normalizeTradeKeyAllocations(allocations);
  if (!normalized) return undefined;

  const grouped = new Map<string, number>();
  normalized.forEach(allocation => {
    grouped.set(allocation.buyTransactionId, (grouped.get(allocation.buyTransactionId) || 0) + 1);
  });

  const tradeAllocations = Array.from(grouped.entries()).map(([buyTransactionId, quantity]) => ({
    buyTransactionId,
    quantity,
  }));

  return tradeAllocations.length > 0 ? tradeAllocations : undefined;
};

const getBuyUnitFeeForCost = (transaction: Transaction, unitCost: number, quantity: number, buyGrossAmount: number) => {
  const rawTransaction = transaction as Transaction & Record<string, unknown>;
  const feeRate = Number(rawTransaction.tradeFeeRate ?? rawTransaction.trade_fee_rate);
  if (Number.isFinite(feeRate) && feeRate > 0) {
    return roundMoney(unitCost * feeRate / 100);
  }

  const explicitFeeAmount = Number(rawTransaction.tradeFeeAmount ?? rawTransaction.trade_fee_amount);
  const inferredFeeAmount = Math.max(0, Number(transaction.amount || 0) - buyGrossAmount);
  const feeAmount = Number.isFinite(explicitFeeAmount) && explicitFeeAmount > 0
    ? explicitFeeAmount
    : inferredFeeAmount;
  return Number.isFinite(feeAmount) && feeAmount > 0 && quantity > 0
    ? roundMoney(feeAmount / quantity)
    : 0;
};

const createTradeCostLots = (
  transactions: Transaction[],
  ledgerId: string,
  categoryId: string,
  excludeTransactionId?: string,
  endTime = Number.POSITIVE_INFINITY,
  endCreatedAt = Number.POSITIVE_INFINITY
) => {
  const lots: CostLot[] = [];

  transactions
    .filter(transaction =>
      !transaction.isDeleted &&
      transaction.ledgerId === ledgerId &&
      transaction.categoryId === categoryId &&
      transaction.id !== excludeTransactionId &&
      (
        transaction.date < endTime ||
        (transaction.date === endTime && Number(transaction.createdAt || 0) < endCreatedAt)
      )
    )
    .sort((a, b) => {
      if (a.date !== b.date) return a.date - b.date;
      return (a.createdAt || 0) - (b.createdAt || 0);
    })
    .forEach(transaction => {
      const tradeAction = transaction.tradeAction || (transaction.type === 'income' ? 'sell' : 'buy');
      const quantity = Number(transaction.tradeQuantity || 0);
      if (!Number.isFinite(quantity) || quantity <= 0) return;

      if (tradeAction === 'buy') {
        const buyGrossAmount = Number(transaction.tradeGrossAmount || transaction.amount || 0);
        const unitCost = buyGrossAmount / quantity;
        const unitFee = getBuyUnitFeeForCost(transaction, unitCost, quantity, buyGrossAmount);
        if (Number.isFinite(unitCost) && unitCost > 0) {
          lots.push({
            buyTransactionId: transaction.id,
            transaction,
            originalQuantity: quantity,
            quantity,
            unitCost,
            unitFee: Number.isFinite(unitFee) && unitFee > 0 ? unitFee : 0,
          });
        }
        return;
      }

      if (tradeAction !== 'sell') return;

      const allocations = normalizeTradeAllocations(transaction.tradeAllocations);
      if (allocations && allocations.length > 0) {
        consumeAllocatedTradeCostLots(lots, allocations);
      } else {
        consumeTradeCostLots(lots, quantity);
      }
    });

  return lots;
};

const consumeLotQuantity = (lot: CostLot, quantity: number) => {
  const usedQuantity = Math.min(quantity, lot.quantity);
  const cost = usedQuantity * (lot.unitCost + lot.unitFee);
  lot.quantity = roundMoney(lot.quantity - usedQuantity);

  return {
    usedQuantity,
    cost,
  };
};

const consumeTradeCostLots = (lots: CostLot[], quantity: number) => {
  let remaining = quantity;
  let cost = 0;

  while (remaining > 0 && lots.length > 0) {
    const lot = lots[0];
    const consumed = consumeLotQuantity(lot, remaining);
    cost += consumed.cost;
    remaining = roundMoney(remaining - consumed.usedQuantity);
    if (lot.quantity <= 0) lots.shift();
  }

  return {
    cost: roundMoney(cost),
    matchedQuantity: roundMoney(quantity - remaining),
  };
};

const consumeAllocatedTradeCostLots = (lots: CostLot[], allocations: TradeAllocation[]) => {
  let cost = 0;
  let matchedQuantity = 0;

  for (const allocation of allocations) {
    let remaining = Number(allocation.quantity || 0);
    if (!Number.isFinite(remaining) || remaining <= 0) continue;

    while (remaining > 0) {
      const lotIndex = lots.findIndex(lot => lot.buyTransactionId === allocation.buyTransactionId && lot.quantity > 0);
      if (lotIndex === -1) break;

      const lot = lots[lotIndex];
      const consumed = consumeLotQuantity(lot, remaining);
      cost += consumed.cost;
      matchedQuantity = roundMoney(matchedQuantity + consumed.usedQuantity);
      remaining = roundMoney(remaining - consumed.usedQuantity);
      if (lot.quantity <= 0) lots.splice(lotIndex, 1);
    }
  }

  return {
    cost: roundMoney(cost),
    matchedQuantity,
  };
};

export const getTradingBuyUnitCost = (transaction: Transaction) => {
  const quantity = Number(transaction.tradeQuantity || 0);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  const buyGrossAmount = Number(transaction.tradeGrossAmount || transaction.amount || 0);
  const unitCost = buyGrossAmount / quantity;
  if (!Number.isFinite(unitCost) || unitCost <= 0) return null;

  const unitFee = getBuyUnitFeeForCost(transaction, unitCost, quantity, buyGrossAmount);
  return roundMoney(unitCost + unitFee);
};

export const getAvailableTradeBuyLots = (
  transactions: Transaction[],
  ledgerId: string,
  categoryId: string,
  excludeTransactionId?: string
): TradeBuyLot[] =>
  createTradeCostLots(transactions, ledgerId, categoryId, excludeTransactionId)
    .filter(lot => lot.quantity > 0)
    .map(lot => ({
      buyTransactionId: lot.buyTransactionId,
      transaction: lot.transaction,
      originalQuantity: lot.originalQuantity,
      remainingQuantity: roundMoney(lot.quantity),
      unitCost: roundMoney(lot.unitCost),
      unitFee: roundMoney(lot.unitFee),
      totalUnitCost: roundMoney(lot.unitCost + lot.unitFee),
    }));

export const getSuggestedTradeAllocations = (
  transactions: Transaction[],
  ledgerId: string,
  categoryId: string,
  quantity: number,
  excludeTransactionId?: string
): TradeAllocation[] => {
  let remaining = Number(quantity || 0);
  if (!Number.isFinite(remaining) || remaining <= 0) return [];

  const allocations: TradeAllocation[] = [];
  const lots = createTradeCostLots(transactions, ledgerId, categoryId, excludeTransactionId);
  for (const lot of lots) {
    if (remaining <= 0) break;
    const usedQuantity = Math.min(remaining, lot.quantity);
    if (usedQuantity > 0) {
      allocations.push({ buyTransactionId: lot.buyTransactionId, quantity: roundMoney(usedQuantity) });
      remaining = roundMoney(remaining - usedQuantity);
    }
  }

  return allocations;
};

export const getTradingAllocationCost = (
  transactions: Transaction[],
  ledgerId: string,
  categoryId: string,
  allocations: TradeAllocation[] | undefined,
  excludeTransactionId?: string,
  endTime = Number.POSITIVE_INFINITY,
  endCreatedAt = Number.POSITIVE_INFINITY
) => {
  const normalizedAllocations = normalizeTradeAllocations(allocations);
  if (!normalizedAllocations) return { cost: 0, matchedQuantity: 0 };

  const lots = createTradeCostLots(transactions, ledgerId, categoryId, excludeTransactionId, endTime, endCreatedAt);
  return consumeAllocatedTradeCostLots(lots, normalizedAllocations);
};

export const getTradingSellCost = (
  transactions: Transaction[],
  ledgerId: string,
  categoryId: string,
  quantity: number,
  excludeTransactionId?: string,
  allocations?: TradeAllocation[]
) => {
  if (allocations && allocations.length > 0) {
    return getTradingAllocationCost(transactions, ledgerId, categoryId, allocations, excludeTransactionId);
  }

  const lots = createTradeCostLots(transactions, ledgerId, categoryId, excludeTransactionId);
  return consumeTradeCostLots(lots, quantity);
};

export const getTradingSellResult = (transactions: Transaction[], transaction: Transaction) => {
  const quantity = Number(transaction.tradeQuantity || 0);
  if (!transaction.categoryId || !Number.isFinite(quantity) || quantity <= 0) return null;

  const lots = createTradeCostLots(
    transactions,
    transaction.ledgerId,
    transaction.categoryId,
    transaction.id,
    transaction.date,
    Number(transaction.createdAt || transaction.date || 0)
  );
  const allocations = normalizeTradeAllocations(transaction.tradeAllocations);
  const result = allocations && allocations.length > 0
    ? getTradingAllocationCost(
        transactions,
        transaction.ledgerId,
        transaction.categoryId,
        allocations,
        transaction.id,
        transaction.date,
        Number(transaction.createdAt || transaction.date || 0)
      )
    : consumeTradeCostLots(lots, quantity);
  if (result.matchedQuantity < quantity) return null;

  const profit = roundMoney(Number(transaction.amount || 0) - result.cost);
  return { ...result, profit };
};

export const getTradingBuyLotSellResult = (transactions: Transaction[], buyTransaction: Transaction) => {
  const unitCost = getTradingBuyUnitCost(buyTransaction);
  if (unitCost === null) {
    return { soldQuantity: 0, revenue: 0, cost: 0, profit: 0 };
  }

  let soldQuantity = 0;
  let revenue = 0;

  transactions.forEach(transaction => {
    if (
      transaction.isDeleted ||
      transaction.ledgerId !== buyTransaction.ledgerId ||
      transaction.categoryId !== buyTransaction.categoryId ||
      transaction.id === buyTransaction.id
    ) {
      return;
    }

    const tradeAction = transaction.tradeAction || (transaction.type === 'income' ? 'sell' : 'buy');
    if (tradeAction !== 'sell') return;

    const allocations = normalizeTradeAllocations(transaction.tradeAllocations);
    if (!allocations) return;

    const allocatedQuantity = allocations
      .filter(allocation => allocation.buyTransactionId === buyTransaction.id)
      .reduce((sum, allocation) => roundMoney(sum + allocation.quantity), 0);
    if (allocatedQuantity <= 0) return;

    const sellQuantity = Number(transaction.tradeQuantity || 0);
    if (!Number.isFinite(sellQuantity) || sellQuantity <= 0) return;

    soldQuantity = roundMoney(soldQuantity + allocatedQuantity);
    revenue += (Number(transaction.amount || 0) / sellQuantity) * allocatedQuantity;
  });

  const cost = roundMoney(soldQuantity * unitCost);
  const roundedRevenue = roundMoney(revenue);
  return {
    soldQuantity,
    revenue: roundedRevenue,
    cost,
    profit: roundMoney(roundedRevenue - cost),
  };
};

export const getTradingRealizedResult = (
  transactions: Transaction[],
  ledgerId: string,
  startTime: number,
  endTime: number
) => {
  const lotsByCategory = new Map<string, CostLot[]>();
  let revenue = 0;
  let cost = 0;
  let profit = 0;

  transactions
    .filter(transaction =>
      !transaction.isDeleted &&
      transaction.ledgerId === ledgerId &&
      transaction.date <= endTime
    )
    .sort((a, b) => {
      if (a.date !== b.date) return a.date - b.date;
      return (a.createdAt || 0) - (b.createdAt || 0);
    })
    .forEach(transaction => {
      const tradeAction = transaction.tradeAction || (transaction.type === 'income' ? 'sell' : 'buy');
      const quantity = Number(transaction.tradeQuantity || 0);
      if (!transaction.categoryId || !Number.isFinite(quantity) || quantity <= 0) return;

      const lots = lotsByCategory.get(transaction.categoryId) || [];
      lotsByCategory.set(transaction.categoryId, lots);

      if (tradeAction === 'buy') {
        const buyGrossAmount = Number(transaction.tradeGrossAmount || transaction.amount || 0);
        const unitCost = buyGrossAmount / quantity;
        const unitFee = getBuyUnitFeeForCost(transaction, unitCost, quantity, buyGrossAmount);
        if (Number.isFinite(unitCost) && unitCost > 0) {
          lots.push({
            buyTransactionId: transaction.id,
            transaction,
            originalQuantity: quantity,
            quantity,
            unitCost,
            unitFee: Number.isFinite(unitFee) && unitFee > 0 ? unitFee : 0,
          });
        }
        return;
      }

      if (tradeAction !== 'sell') return;

      const allocations = normalizeTradeAllocations(transaction.tradeAllocations);
      const result = allocations && allocations.length > 0
        ? consumeAllocatedTradeCostLots(lots, allocations)
        : consumeTradeCostLots(lots, quantity);

      if (transaction.date >= startTime) {
        const transactionRevenue = Number(transaction.amount || 0);
        revenue += transactionRevenue;
        cost += result.cost;
        profit += transactionRevenue - result.cost;
      }
    });

  return {
    revenue: roundMoney(revenue),
    cost: roundMoney(cost),
    profit: roundMoney(profit),
  };
};

export const getTradingRealizedProfit = (
  transactions: Transaction[],
  ledgerId: string,
  startTime: number,
  endTime: number
) => getTradingRealizedResult(transactions, ledgerId, startTime, endTime).profit;
