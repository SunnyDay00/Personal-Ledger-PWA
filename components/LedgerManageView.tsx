import React, { useState, useMemo } from 'react';
import { useApp } from '../contexts/AppContext';
import { Icon } from './ui/Icon';
import { feedback } from '../services/feedback';
import { format } from 'date-fns';
import { clsx } from 'clsx';
import { Ledger } from '../types';

export const LedgerManageView: React.FC = () => {
    const { state, dispatch, addLedger } = useApp();
    const [isEditing, setIsEditing] = useState(false);
    const [newLedgerName, setNewLedgerName] = useState('');

    // Compute stats for each ledger
    const ledgerStats = useMemo(() => {
        const stats: Record<string, { incomeCount: number; expenseCount: number; incomeTotal: number; expenseTotal: number }> = {};

        state.ledgers.forEach(l => {
            stats[l.id] = { incomeCount: 0, expenseCount: 0, incomeTotal: 0, expenseTotal: 0 };
        });

        state.transactions.forEach(t => {
            if (!t.isDeleted && stats[t.ledgerId]) {
                if (t.type === 'income') {
                    stats[t.ledgerId].incomeCount++;
                    stats[t.ledgerId].incomeTotal += t.amount;
                } else {
                    stats[t.ledgerId].expenseCount++;
                    stats[t.ledgerId].expenseTotal += t.amount;
                }
            }
        });

        return stats;
    }, [state.transactions, state.ledgers]);

    const handleAddLedger = async () => {
        if (!newLedgerName.trim()) return;

        const newLedger: Ledger = {
            id: crypto.randomUUID(),
            name: newLedgerName.trim(),
            themeColor: '#007AFF', // Default Blue
            createdAt: Date.now(),
            updatedAt: Date.now(),
            isDeleted: false
        };

        await addLedger(newLedger);
        feedback.play('success');
        setNewLedgerName('');
        setIsEditing(false);
    };

    const handleDeleteLedger = (id: string, name: string) => {
        if (state.ledgers.length <= 1) {
            alert("至少保留一个账本");
            return;
        }
        if (confirm(`确定要删除账本 "${name}" 吗？该操作不可恢复。`)) {
            dispatch({ type: 'DELETE_LEDGER', payload: id });
            feedback.play('delete');
        }
    };

    const handleSwitchLedger = (id: string) => {
        dispatch({ type: 'SET_LEDGER', payload: id });
        feedback.play('click');
    };

    return (
        <div className="flex flex-col h-full bg-ios-bg">
            {/* Header - Fixed & Glassmorphism (Matched to StatsView) */}
            <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-center pt-[env(safe-area-inset-top)] h-[calc(env(safe-area-inset-top)+3.5rem)] bg-ios-bg/80 backdrop-blur-xl border-b border-black/5 dark:border-white/5 transition-colors">
                <h1 className="text-base font-semibold text-ios-text">账本管理</h1>
                <button
                    onClick={() => {
                        feedback.play('click');
                        setIsEditing(!isEditing);
                    }}
                    className="absolute right-4 p-2 text-ios-primary active:opacity-60 transition-opacity"
                >
                    <Icon name={isEditing ? "X" : "Plus"} className="w-6 h-6" />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 pb-32 space-y-4 pt-[calc(env(safe-area-inset-top)+4.5rem)]">

                {/* Search / Add Bar */}
                {isEditing && (
                    <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl shadow-sm animate-fade-in border border-black/5 dark:border-white/5 mx-1">
                        <label className="block text-xs font-medium text-gray-500 mb-2">新建账本名称</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newLedgerName}
                                onChange={e => setNewLedgerName(e.target.value)}
                                placeholder="例如：家庭账本"
                                className="flex-1 px-4 py-2 bg-gray-100 dark:bg-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-ios-primary/50 text-ios-text transition-all"
                                autoFocus
                            />
                            <button
                                onClick={handleAddLedger}
                                disabled={!newLedgerName.trim()}
                                className="px-4 py-2 bg-ios-primary text-white rounded-xl font-medium disabled:opacity-50 active:scale-95 transition-all"
                            >
                                添加
                            </button>
                        </div>
                    </div>
                )}

                {/* Ledger List */}
                <div className="space-y-4">
                    {state.ledgers.map(ledger => {
                        const stats = ledgerStats[ledger.id] || { incomeCount: 0, expenseCount: 0, incomeTotal: 0, expenseTotal: 0 };
                        const isActive = state.currentLedgerId === ledger.id;

                        return (
                            <div
                                key={ledger.id}
                                onClick={() => handleSwitchLedger(ledger.id)}
                                className={clsx(
                                    "relative overflow-hidden group rounded-2xl p-4 transition-all duration-300 active:scale-[0.98]",
                                    isActive
                                        ? "bg-white dark:bg-zinc-800 ring-2 ring-ios-primary shadow-lg shadow-ios-primary/10"
                                        : "bg-white dark:bg-zinc-900 shadow-sm border border-black/5 dark:border-white/5 hover:border-ios-primary/30"
                                )}
                            >
                                {/* Active Indicator (Tick) */}
                                {isActive && (
                                    <div className="absolute top-3 right-3 text-ios-primary">
                                        <Icon name="CheckCircle2" className="w-5 h-5 fill-current/10" />
                                    </div>
                                )}

                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        {/* Icon/Avatar Placeholder */}
                                        <div
                                            className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold shadow-sm text-xl"
                                            style={{ backgroundColor: ledger.themeColor || '#007AFF' }}
                                        >
                                            {ledger.name.slice(0, 1)}
                                        </div>
                                        <div>
                                            <h3 className={clsx("font-semibold text-lg", isActive ? "text-ios-primary" : "text-ios-text")}>
                                                {ledger.name}
                                            </h3>
                                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                                创建于 {format(ledger.createdAt || 0, 'yyyy年MM月dd日')}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Stats Grid */}
                                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs border-t border-dashed border-gray-200 dark:border-zinc-700 pt-3">
                                    <div className="flex justify-between items-center text-gray-500">
                                        <div className="flex flex-col">
                                            <span>总支出</span>
                                            <span className="text-[11px] text-gray-600 dark:text-gray-400 font-medium mt-0.5">共 {stats.expenseCount} 笔</span>
                                        </div>
                                        <span className="font-medium text-ios-text text-base">¥{stats.expenseTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 元</span>
                                    </div>
                                    <div className="flex justify-between items-center text-gray-500">
                                        <div className="flex flex-col">
                                            <span>总收入</span>
                                            <span className="text-[11px] text-gray-600 dark:text-gray-400 font-medium mt-0.5">共 {stats.incomeCount} 笔</span>
                                        </div>
                                        <span className="font-medium text-green-600 dark:text-green-400 text-base">¥{stats.incomeTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 元</span>
                                    </div>
                                    <div className="col-span-2 mt-1 text-right">
                                        {/* Actions (visible when not active, or just delete) */}
                                        {!isActive && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteLedger(ledger.id, ledger.name);
                                                }}
                                                className="text-red-500 text-xs px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                            >
                                                删除账本
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {state.ledgers.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                        <Icon name="BookOpen" className="w-12 h-12 mb-2 opacity-50" />
                        <p>暂无账本</p>
                    </div>
                )}
            </div>
        </div>
    );
};
