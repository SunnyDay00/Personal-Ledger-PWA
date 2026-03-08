import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format, isSameDay } from 'date-fns';
import { clsx } from 'clsx';
import { useApp } from '../contexts/AppContext';
import { Transaction, TransactionType } from '../types';
import { AddView } from './AddView';
import { ImagePreview } from './ImagePreview';
import { Icon } from './ui/Icon';
import { feedback } from '../services/feedback';
import { formatCurrency } from '../utils';

interface StatsBreakdownDetailViewProps {
    breakdownLabel: '分类' | '分组';
    name: string;
    subtitle: string;
    dataType: TransactionType;
    accentColor: string;
    transactions: Transaction[];
    onClose: () => void;
    onOpenHomeTransaction?: (transaction: Transaction) => void;
}

interface TransactionDayGroup {
    dateKey: string;
    date: Date;
    total: number;
    transactions: Transaction[];
}

export const StatsBreakdownDetailView: React.FC<StatsBreakdownDetailViewProps> = ({
    breakdownLabel,
    name,
    subtitle,
    dataType,
    accentColor,
    transactions,
    onClose,
    onOpenHomeTransaction,
}) => {
    const { state } = useApp();
    const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
    const [previewKeys, setPreviewKeys] = useState<string[] | null>(null);
    const longPressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const longPressTriggeredRef = useRef(false);

    const clearLongPress = () => {
        if (longPressTimeoutRef.current) {
            clearTimeout(longPressTimeoutRef.current);
            longPressTimeoutRef.current = null;
        }
    };

    useEffect(() => () => {
        clearLongPress();
    }, []);

    const handlePressStart = (transaction: Transaction) => {
        if (!onOpenHomeTransaction) return;

        clearLongPress();
        longPressTriggeredRef.current = false;
        longPressTimeoutRef.current = setTimeout(() => {
            longPressTriggeredRef.current = true;
            feedback.play('success');
            feedback.vibrate('medium');
            onOpenHomeTransaction(transaction);
            clearLongPress();
        }, 450);
    };

    const handlePressEnd = () => {
        clearLongPress();
    };

    const sortedTransactions = useMemo(
        () => [...transactions].sort((a, b) => b.date - a.date || (b.createdAt || 0) - (a.createdAt || 0)),
        [transactions]
    );

    const totalAmount = useMemo(
        () => sortedTransactions.reduce((sum, transaction) => sum + transaction.amount, 0),
        [sortedTransactions]
    );

    const groupedTransactions = useMemo<TransactionDayGroup[]>(() => {
        const groups = new Map<string, TransactionDayGroup>();

        sortedTransactions.forEach(transaction => {
            const dateKey = format(transaction.date, 'yyyy-MM-dd');
            const existing = groups.get(dateKey) || {
                dateKey,
                date: new Date(transaction.date),
                total: 0,
                transactions: [],
            };

            existing.total += transaction.amount;
            existing.transactions.push(transaction);
            groups.set(dateKey, existing);
        });

        return Array.from(groups.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
    }, [sortedTransactions]);

    return (
        <>
            <div
                className={clsx(
                    'fixed inset-0 z-[60] flex flex-col overflow-hidden bg-white/52 dark:bg-zinc-950/56 backdrop-blur-[26px]',
                    state.settings.enableAnimations && 'animate-slide-up'
                )}
            >
                <div className="shrink-0 pt-[env(safe-area-inset-top)] bg-white/28 dark:bg-zinc-950/30 backdrop-blur-[30px] border-b border-white/45 dark:border-white/12 shadow-[0_12px_30px_rgba(15,23,42,0.08)] dark:shadow-[0_12px_30px_rgba(0,0,0,0.28)]">
                    <div className="h-14 px-4 flex items-center justify-between">
                        <button onClick={onClose} className="p-2 -ml-2 text-ios-text">
                            <Icon name="ChevronLeft" className="w-5 h-5" />
                        </button>
                        <h2 className="text-base font-semibold text-ios-text">{breakdownLabel}明细</h2>
                        <div className="w-9" />
                    </div>
                </div>

                <div
                    className="flex-1 overflow-y-auto no-scrollbar px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]"
                    style={{ WebkitOverflowScrolling: 'touch' }}
                >
                    <div className="bg-white/54 dark:bg-zinc-900/56 backdrop-blur-[24px] rounded-3xl p-5 shadow-[0_16px_36px_rgba(15,23,42,0.10)] dark:shadow-[0_16px_36px_rgba(0,0,0,0.30)] border border-white/50 dark:border-white/12 mb-5">
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                                <p className="text-xs font-semibold uppercase tracking-wide text-ios-subtext">{breakdownLabel}</p>
                                <h3 className="mt-2 text-2xl font-semibold text-ios-text truncate">{name}</h3>
                                <p className="mt-1 text-xs text-ios-subtext">{subtitle}</p>
                            </div>
                            <div
                                className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                                style={{ backgroundColor: `${accentColor}1F` }}
                            >
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: accentColor }} />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mt-5">
                            <div className="rounded-2xl bg-white/38 dark:bg-zinc-800/40 backdrop-blur-[18px] p-4 border border-white/45 dark:border-white/10">
                                <p className="text-xs text-ios-subtext">{dataType === 'expense' ? '总支出' : '总收入'}</p>
                                <p
                                    className={clsx(
                                        'mt-2 text-lg font-bold tabular-nums',
                                        dataType === 'expense' ? 'text-red-500' : 'text-green-500'
                                    )}
                                >
                                    {formatCurrency(totalAmount)}
                                </p>
                            </div>
                            <div className="rounded-2xl bg-white/38 dark:bg-zinc-800/40 backdrop-blur-[18px] p-4 border border-white/45 dark:border-white/10">
                                <p className="text-xs text-ios-subtext">记录数</p>
                                <p className="mt-2 text-lg font-bold text-ios-text tabular-nums">{sortedTransactions.length} 笔</p>
                            </div>
                        </div>
                    </div>

                    {groupedTransactions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 opacity-60">
                            <Icon name="BookOpen" className="w-12 h-12 mb-3 text-ios-subtext" />
                            <p className="text-sm text-ios-subtext">该{breakdownLabel}下暂无记录</p>
                        </div>
                    ) : (
                        groupedTransactions.map(group => {
                            const isToday = isSameDay(group.date, new Date());

                            return (
                                <section key={group.dateKey} className="mb-4">
                                    <div className="flex items-end justify-between mb-2 px-1">
                                        <div>
                                            <p className="text-sm font-semibold text-ios-text">
                                                {isToday ? '今天' : format(group.date, 'MM月dd日')}
                                            </p>
                                            <p className="text-xs text-ios-subtext">
                                                {new Intl.DateTimeFormat('zh-CN', { weekday: 'long' }).format(group.date)}
                                            </p>
                                        </div>
                                        <span
                                            className={clsx(
                                                'text-xs font-semibold tabular-nums',
                                                dataType === 'expense' ? 'text-ios-text/70' : 'text-green-500'
                                            )}
                                        >
                                            {dataType === 'expense' ? '-' : '+'}
                                            {formatCurrency(group.total)}
                                        </span>
                                    </div>

                                    <div className="bg-white/46 dark:bg-zinc-900/50 backdrop-blur-[22px] rounded-2xl overflow-hidden shadow-[0_14px_32px_rgba(15,23,42,0.08)] dark:shadow-[0_14px_32px_rgba(0,0,0,0.28)] border border-white/45 dark:border-white/12">
                                        {group.transactions.map((transaction, index) => {
                                            const category = state.categories.find(item => item.id === transaction.categoryId);
                                            const title = transaction.note.trim() || category?.name || '未知分类';
                                            const timeLabel = format(transaction.createdAt || transaction.date, 'HH:mm');
                                            const metaParts = [
                                                ...(title !== category?.name && category?.name ? [category.name] : []),
                                                timeLabel,
                                            ];

                                            return (
                                                <div
                                                    key={transaction.id}
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={() => {
                                                        if (longPressTriggeredRef.current) {
                                                            longPressTriggeredRef.current = false;
                                                            return;
                                                        }
                                                        setEditingTransaction(transaction);
                                                    }}
                                                    onPointerDown={(event) => {
                                                        if (event.button !== 0) return;
                                                        handlePressStart(transaction);
                                                    }}
                                                    onPointerUp={handlePressEnd}
                                                    onPointerLeave={handlePressEnd}
                                                    onPointerCancel={handlePressEnd}
                                                    onContextMenu={(event) => {
                                                        if (onOpenHomeTransaction) {
                                                            event.preventDefault();
                                                        }
                                                    }}
                                                    onKeyDown={(event) => {
                                                        if (event.key === 'Enter' || event.key === ' ') {
                                                            event.preventDefault();
                                                            setEditingTransaction(transaction);
                                                        }
                                                    }}
                                                    className={clsx(
                                                        'w-full flex items-center justify-between gap-3 p-3.5 text-left active:bg-gray-50 dark:active:bg-zinc-800 transition-colors focus:outline-none focus:ring-2 focus:ring-ios-primary/20',
                                                        index !== group.transactions.length - 1 && 'border-b border-gray-100 dark:border-zinc-800/60'
                                                    )}
                                                >
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-100 dark:bg-zinc-800 text-ios-primary shrink-0">
                                                            <Icon name={category?.icon || 'Circle'} className="w-4 h-4" />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-1.5 min-w-0">
                                                                <span className="text-sm font-medium text-ios-text truncate">{title}</span>
                                                                {transaction.attachments.length > 0 && (
                                                                    <button
                                                                        type="button"
                                                                        onPointerDown={(event) => {
                                                                            event.stopPropagation();
                                                                        }}
                                                                        onClick={(event) => {
                                                                            event.stopPropagation();
                                                                            setPreviewKeys(transaction.attachments);
                                                                        }}
                                                                        className="flex items-center gap-0.5 text-ios-primary opacity-80 active:opacity-60 shrink-0"
                                                                    >
                                                                        <Icon name="Image" className="w-4 h-4" strokeWidth={2.5} />
                                                                        {transaction.attachments.length > 1 && (
                                                                            <span className="text-[10px] font-bold">{transaction.attachments.length}</span>
                                                                        )}
                                                                    </button>
                                                                )}
                                                            </div>
                                                            <p className="mt-1 text-[11px] text-ios-subtext truncate">{metaParts.join(' · ')}</p>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <span
                                                            className={clsx(
                                                                'text-sm font-semibold tabular-nums',
                                                                transaction.type === 'expense' ? 'text-ios-text' : 'text-green-500'
                                                            )}
                                                        >
                                                            {transaction.type === 'expense' ? '-' : '+'}
                                                            {formatCurrency(transaction.amount)}
                                                        </span>
                                                        <Icon name="ChevronRight" className="w-4 h-4 text-ios-subtext" />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </section>
                            );
                        })
                    )}
                </div>
            </div>

            {editingTransaction && (
                <AddView
                    onClose={() => setEditingTransaction(null)}
                    initialTransaction={editingTransaction}
                />
            )}
            {previewKeys && <ImagePreview keys={previewKeys} onClose={() => setPreviewKeys(null)} />}
        </>
    );
};
