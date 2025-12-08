import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../contexts/AppContext';
import { Icon } from './ui/Icon';
import { feedback } from '../services/feedback';
import { CloudSyncButton } from './CloudSyncButton'; // Import
import { formatCurrency, getWeekRange, getMonthRange, getYearRange } from '../utils';
import { format, isSameDay, addWeeks, addMonths, addYears, addDays } from 'date-fns';
import { Transaction, Category } from '../types';
import { AddView } from './AddView';
import { clsx } from 'clsx';

interface HomeViewProps {
    onOpenSearch: () => void;
    onOpenBudget: () => void;
}

export const HomeView: React.FC<HomeViewProps> = ({ onOpenSearch, onOpenBudget }) => {
    const { state, deleteTransaction, dispatch, batchDeleteTransactions, batchUpdateTransactions } = useApp();
    const { currentLedgerId, transactions, categories, ledgers, settings, timeRange, currentDate: currentDateTs } = state;
    const currentLedger = ledgers.find(l => l.id === currentLedgerId) || ledgers[0];
    const currentDate = new Date(currentDateTs);

    const [showLedgerMenu, setShowLedgerMenu] = useState(false);
    // Removed showSyncLog state, handled by CloudSyncButton
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
    const [showBatchEdit, setShowBatchEdit] = useState(false);

    useEffect(() => {
        if (settings.budget.enabled) {
            dispatch({ type: 'SET_TIME_RANGE', payload: settings.budget.displayType });
        }
    }, [settings.budget.enabled, settings.budget.displayType]);

    // Removed old Sync Status Icon Logic

    const { start, end } = useMemo(() => {
        if (timeRange === 'week') return getWeekRange(currentDate);
        if (timeRange === 'year') return getYearRange(currentDate);
        return getMonthRange(currentDate);
    }, [timeRange, currentDate]);

    const handlePrev = () => {
        feedback.play('switch');
        let newDate;
        if (timeRange === 'week') newDate = addWeeks(currentDate, -1);
        else if (timeRange === 'month') newDate = addMonths(currentDate, -1);
        else newDate = addYears(currentDate, -1);
        dispatch({ type: 'SET_CURRENT_DATE', payload: newDate.getTime() });
    };

    const handleNext = () => {
        feedback.play('switch');
        let newDate;
        if (timeRange === 'week') newDate = addWeeks(currentDate, 1);
        else if (timeRange === 'month') newDate = addMonths(currentDate, 1);
        else newDate = addYears(currentDate, 1);
        dispatch({ type: 'SET_CURRENT_DATE', payload: newDate.getTime() });
    };

    const displayDate = useMemo(() => {
        if (timeRange === 'year') return format(currentDate, 'yyyy年');
        if (timeRange === 'month') return format(currentDate, 'yyyy年 MM月');
        const { start: s, end: e } = getWeekRange(currentDate);
        return `${format(s, 'MM.dd')} - ${format(e, 'MM.dd')}`;
    }, [timeRange, currentDate]);

    const startTime = start.getTime();
    const endTime = end.getTime();

    const filteredTransactions = useMemo(() => {
        return transactions
            .filter(t => t.ledgerId === currentLedgerId && t.date >= startTime && t.date <= endTime)
            .sort((a, b) => b.date - a.date);
    }, [transactions, currentLedgerId, startTime, endTime]);

    const groupedTransactions = useMemo(() => {
        const groups: { [key: string]: typeof transactions } = {};
        filteredTransactions.forEach(t => {
            const dateKey = format(t.date, 'yyyy-MM-dd');
            if (!groups[dateKey]) groups[dateKey] = [];
            groups[dateKey].push(t);
        });
        return groups;
    }, [filteredTransactions]);

    const { income, expense, balance } = useMemo(() => {
        return filteredTransactions.reduce(
            (acc, t) => {
                if (t.type === 'income') acc.income += t.amount;
                else acc.expense += t.amount;
                return acc;
            },
            { income: 0, expense: 0, balance: 0 }
        );
    }, [filteredTransactions]);

    const currentBalance = income - expense;
    const budgetTarget = settings.budget.enabled ? settings.budget.targets[timeRange].expense : 0;
    const remainingBudget = budgetTarget - expense;
    const isOverBudget = remainingBudget < 0;
    const budgetProgress = settings.budget.enabled && budgetTarget > 0 ? (expense / budgetTarget) * 100 : 0;
    const displayProgress = Math.min(budgetProgress, 100);

    const toggleSelection = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const handleBatchDelete = () => {
        if (confirm(`确定要删除选中的 ${selectedIds.size} 条记录吗？`)) {
            feedback.play('delete');
            feedback.vibrate('light');
            batchDeleteTransactions(Array.from(selectedIds));
            setIsSelectionMode(false);
            setSelectedIds(new Set());
        }
    };

    const handleBatchUpdate = (updates: Partial<Transaction>) => {
        if (Object.keys(updates).length === 0) return;
        if (confirm(`确定要更新选中的 ${selectedIds.size} 条记录吗？`)) {
            feedback.play('success');
            feedback.vibrate('success');
            batchUpdateTransactions(Array.from(selectedIds), updates);
            setIsSelectionMode(false);
            setSelectedIds(new Set());
            setShowBatchEdit(false);
        }
    };

    return (
        <div className={clsx("h-full w-full bg-ios-bg", settings.enableAnimations && "animate-slide-up")}>

            {/* Header - Fixed & Glassmorphism */}
            <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 pt-[env(safe-area-inset-top)] h-[calc(env(safe-area-inset-top)+3.5rem)] bg-ios-bg/80 backdrop-blur-xl border-b border-black/5 dark:border-white/5 transition-colors">
                <div className="relative">
                    <button onClick={() => {
                        feedback.play('click');
                        feedback.vibrate('light');
                        setShowLedgerMenu(!showLedgerMenu);
                    }} className="flex items-center space-x-2 active:opacity-60 transition-opacity bg-white/50 dark:bg-zinc-800/50 backdrop-blur-md px-3 py-1.5 rounded-full shadow-sm">
                        <h1 className="text-sm font-bold text-ios-text max-w-[120px] truncate">{currentLedger.name}</h1>
                        <Icon name="ChevronDown" className="w-3 h-3 text-ios-subtext" />
                    </button>
                    {showLedgerMenu && (
                        <div className="absolute top-full mt-2 left-0 w-48 bg-white dark:bg-zinc-800 rounded-xl shadow-xl border border-gray-100 dark:border-zinc-700 overflow-hidden animate-fade-in z-50">
                            {ledgers.map(l => (
                                <button key={l.id} onClick={() => {
                                    feedback.play('success');
                                    feedback.vibrate('success');
                                    dispatch({ type: 'SET_LEDGER', payload: l.id });
                                    setShowLedgerMenu(false);
                                }} className="w-full text-left px-4 py-3 text-sm hover:bg-gray-50 dark:hover:bg-zinc-700 flex justify-between items-center">
                                    <span>{l.name}</span>
                                    {l.id === currentLedgerId && <Icon name="Check" className="w-3 h-3 text-ios-primary" />}
                                </button>
                            ))}
                            <div className="border-t border-gray-100 dark:border-zinc-700 p-2"><button className="w-full text-center text-xs text-ios-primary py-1">新建账本 (请去设置)</button></div>
                        </div>
                    )}
                </div>

                <div className="flex space-x-3 items-center">
                    <button onClick={() => { setIsSelectionMode(!isSelectionMode); setSelectedIds(new Set()); }} className="text-ios-primary text-sm font-medium">{isSelectionMode ? '完成' : '选择'}</button>
                    {!isSelectionMode && (
                        <>
                            <button onClick={onOpenBudget} className="p-2 rounded-full bg-white/50 dark:bg-zinc-800/50 backdrop-blur-md shadow-sm active:scale-95 transition-transform"><Icon name="PieChart" className="w-5 h-5 text-ios-primary" /></button>
                            <button onClick={onOpenSearch} className="p-2 rounded-full bg-white/50 dark:bg-zinc-800/50 backdrop-blur-md shadow-sm active:scale-95 transition-transform"><Icon name="Search" className="w-5 h-5 text-ios-text" /></button>
                            <CloudSyncButton />
                        </>
                    )}
                </div>
            </div>

            {/* Main Content - Scrollable */}
            <div
                className="h-full w-full overflow-y-auto no-scrollbar px-4 pt-[calc(env(safe-area-inset-top)+4.5rem)] pb-[calc(env(safe-area-inset-bottom)+6rem)]"
                style={{ WebkitOverflowScrolling: 'touch' }}
            >
                <div className="mb-4">
                    <div className="flex justify-between items-center mb-3 px-2">
                        <button onClick={handlePrev} className="p-1"><Icon name="ChevronLeft" className="w-5 h-5 text-ios-subtext" /></button>
                        <span className="text-sm font-medium text-ios-text tabular-nums">{displayDate}</span>
                        <button onClick={handleNext} className="p-1"><Icon name="ChevronRight" className="w-5 h-5 text-ios-subtext" /></button>
                    </div>
                    <div className="flex justify-center bg-gray-200/50 dark:bg-zinc-800/50 p-0.5 rounded-lg">
                        {(['week', 'month', 'year'] as const).map(range => (
                            <button key={range} onClick={() => {
                                feedback.play('switch');
                                dispatch({ type: 'SET_TIME_RANGE', payload: range });
                            }} className={`flex-1 py-1 text-xs font-medium rounded-md transition-all ${timeRange === range ? 'bg-white dark:bg-zinc-700 shadow-sm text-ios-text' : 'text-ios-subtext'}`}>{range === 'week' ? '周' : range === 'month' ? '月' : '年'}</button>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-6">
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl p-3 shadow-sm border border-ios-border flex flex-col items-center">
                        <span className="text-xs text-ios-subtext mb-1">收入</span>
                        <span className="text-sm font-bold text-green-500 tabular-nums">{formatCurrency(income)}</span>
                    </div>
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl p-3 shadow-sm border border-ios-border flex flex-col items-center">
                        <span className="text-xs text-ios-subtext mb-1">支出</span>
                        <span className="text-sm font-bold text-red-500 tabular-nums">{formatCurrency(expense)}</span>
                    </div>
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl p-3 shadow-sm border border-ios-border flex flex-col items-center">
                        <span className="text-xs text-ios-subtext mb-1">结余</span>
                        <span className="text-sm font-bold text-ios-primary tabular-nums">{formatCurrency(currentBalance)}</span>
                    </div>
                </div>

                {settings.budget.enabled && (
                    <div className={clsx("bg-white dark:bg-zinc-900 rounded-2xl p-4 shadow-sm border mb-6 animate-fade-in cursor-pointer relative overflow-hidden", isOverBudget ? "border-red-200 dark:border-red-900/30 ring-1 ring-red-100 dark:ring-red-900/20" : "border-ios-border")} onClick={onOpenBudget}>
                        {isOverBudget && <div className="absolute inset-0 bg-red-50/50 dark:bg-red-900/10 pointer-events-none"></div>}
                        <div className="relative z-10">
                            <div className="flex justify-between text-[10px] text-ios-subtext mb-1.5">
                                <span>预算 {formatCurrency(budgetTarget)}</span>
                                <span className={clsx("font-medium", isOverBudget ? "text-red-500 font-bold" : "")}>
                                    {isOverBudget ? `超支 ${formatCurrency(Math.abs(remainingBudget))}` : `剩余 ${formatCurrency(remainingBudget)}`}
                                </span>
                            </div>
                            <div className="h-2.5 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden flex relative">
                                <div className={clsx("h-full rounded-full transition-all duration-500", isOverBudget ? "bg-red-500" : (budgetProgress > settings.budget.notifyThreshold ? "bg-orange-400" : "bg-ios-primary"))} style={{ width: `${displayProgress}%` }}></div>
                            </div>
                            {isOverBudget && (
                                <div className="flex items-center gap-1 mt-2 text-[10px] text-red-500 animate-pulse">
                                    <Icon name="AlertCircle" className="w-3 h-3" />
                                    <span>预算超支，请注意控制开销</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div>
                    {Object.keys(groupedTransactions).map(dateKey => {
                        const dateObj = new Date(dateKey);
                        const isToday = isSameDay(dateObj, new Date());
                        return (
                            <div key={dateKey} className="mb-4">
                                <div className="flex justify-between items-end mb-2 px-3">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-bold text-ios-text">{format(dateObj, 'dd')}</span>
                                        <span className="text-xs text-ios-subtext">{isToday ? '今天' : `${format(dateObj, 'MM月')} / ${new Intl.DateTimeFormat('zh-CN', { weekday: 'long' }).format(dateObj)}`}</span>
                                    </div>
                                </div>
                                <div className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-lg rounded-2xl overflow-hidden shadow-sm border border-white/40 dark:border-white/5">
                                    {groupedTransactions[dateKey].map((t, index) => {
                                        const category = categories.find(c => c.id === t.categoryId);
                                        const isSelected = selectedIds.has(t.id);
                                        return (
                                            <div key={t.id} onClick={() => { if (isSelectionMode) toggleSelection(t.id); else setEditingTransaction(t); }} className={`group relative flex items-center justify-between p-3.5 active:bg-gray-50 dark:active:bg-zinc-800 transition-colors ${index !== groupedTransactions[dateKey].length - 1 ? 'border-b border-gray-100 dark:border-zinc-800/50' : ''}`}>
                                                <div className="flex items-center gap-3">
                                                    {isSelectionMode && (
                                                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${isSelected ? 'bg-ios-primary border-ios-primary' : 'border-gray-300 dark:border-zinc-600'}`}>
                                                            {isSelected && <Icon name="Check" className="w-3 h-3 text-white" />}
                                                        </div>
                                                    )}
                                                    <div className={`w-9 h-9 rounded-full flex items-center justify-center bg-gray-100 dark:bg-zinc-800 text-ios-primary`}>
                                                        <Icon name={category?.icon || 'Circle'} className="w-4 h-4" />
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <div className="text-sm font-medium text-ios-text">{category?.name}</div>
                                                        <div className="text-[10px] text-ios-subtext flex gap-1">
                                                            <span>{format(t.createdAt, 'HH:mm')}</span>
                                                            {t.note && <span>· {t.note}</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <div className={`font-semibold text-sm tabular-nums ${t.type === 'expense' ? 'text-ios-text' : 'text-green-500'}`}>
                                                        {t.type === 'expense' ? '-' : '+'}{formatCurrency(t.amount).replace('¥', '')}
                                                    </div>
                                                    {!isSelectionMode && (
                                                        <button onClick={(e) => {
                                                            e.stopPropagation();
                                                            feedback.play('delete');
                                                            feedback.vibrate('light');
                                                            deleteTransaction(t.id);
                                                        }} className="p-2 -mr-2 text-gray-300 hover:text-red-500"><Icon name="X" className="w-4 h-4" /></button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                    {filteredTransactions.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-20 opacity-50"><Icon name="BookOpen" className="w-12 h-12 mb-3 text-ios-subtext" /><p className="text-ios-subtext text-sm">暂无账单</p></div>
                    )}
                </div>
            </div>

            {isSelectionMode && (
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl border-t border-gray-200 dark:border-zinc-800 flex justify-between items-center z-50 pb-[env(safe-area-inset-bottom)]">
                    <span className="text-sm text-ios-subtext">已选 {selectedIds.size} 项</span>
                    <div className="flex gap-3">
                        <button onClick={() => setShowBatchEdit(true)} disabled={selectedIds.size === 0} className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium disabled:opacity-50">批量编辑</button>
                        <button onClick={handleBatchDelete} disabled={selectedIds.size === 0} className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium disabled:opacity-50">批量删除</button>
                    </div>
                </div>
            )}

            {showBatchEdit && <BatchEditModal categories={categories} onClose={() => setShowBatchEdit(false)} onSave={handleBatchUpdate} />}
            {editingTransaction && <AddView onClose={() => setEditingTransaction(null)} initialTransaction={editingTransaction} />}
        </div>
    );
};

// Internal Batch Edit Modal (kept for completeness)
const BatchEditModal: React.FC<{ categories: Category[]; onClose: () => void; onSave: (updates: Partial<Transaction>) => void }> = ({ categories, onClose, onSave }) => {
    const [updateCat, setUpdateCat] = useState(false);
    const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
    const [updateDate, setUpdateDate] = useState(false);
    const [date, setDate] = useState(new Date());
    const [updateNote, setUpdateNote] = useState(false);
    const [note, setNote] = useState('');

    const handleSave = () => {
        const updates: Partial<Transaction> = {};
        if (updateCat && selectedCatId) updates.categoryId = selectedCatId;
        if (updateDate) updates.date = date.getTime();
        if (updateNote) updates.note = note;
        onSave(updates);
    };

    return (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-end bg-black/40 backdrop-blur-sm animate-fade-in">
            <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-t-3xl p-6 shadow-2xl animate-slide-up pb-[calc(env(safe-area-inset-bottom)+1rem)]">
                <div className="flex justify-between items-center mb-6"><button onClick={onClose} className="text-ios-subtext">取消</button><h3 className="font-bold text-lg">批量修改</h3><button onClick={handleSave} className="text-ios-primary font-bold">保存</button></div>
                <div className="space-y-6 max-h-[70vh] overflow-y-auto no-scrollbar pb-6">
                    <div className="space-y-3"><div className="flex items-center justify-between"><span className="font-medium text-sm">修改分类</span><input type="checkbox" checked={updateCat} onChange={(e) => setUpdateCat(e.target.checked)} className="accent-ios-primary w-5 h-5" /></div>{updateCat && <div className="grid grid-cols-5 gap-3 bg-gray-50 dark:bg-zinc-800 p-3 rounded-xl">{categories.slice(0, 15).map(cat => (<button key={cat.id} onClick={() => { setSelectedCatId(cat.id); setUpdateCat(true); }} className={`flex flex-col items-center gap-1 p-2 rounded-lg ${selectedCatId === cat.id ? 'bg-white dark:bg-zinc-700 shadow-sm' : ''}`}><div className={`w-8 h-8 rounded-full flex items-center justify-center ${selectedCatId === cat.id ? 'bg-ios-primary text-white' : 'bg-gray-200 dark:bg-zinc-600'}`}><Icon name={cat.icon} className="w-4 h-4" /></div><span className="text-[10px] truncate w-full text-center">{cat.name}</span></button>))}</div>}</div>
                    <div className="space-y-3 pt-4 border-t border-gray-100 dark:border-zinc-800"><div className="flex items-center justify-between"><span className="font-medium text-sm">修改日期</span><input type="checkbox" checked={updateDate} onChange={(e) => setUpdateDate(e.target.checked)} className="accent-ios-primary w-5 h-5" /></div>{updateDate && <div className="flex gap-2 justify-between bg-gray-50 dark:bg-zinc-800 p-3 rounded-xl">{[-1, 0, 1].map(offset => { const d = addDays(new Date(), offset); return (<button key={offset} onClick={() => { setDate(d); setUpdateDate(true); }} className={clsx("px-3 py-2 rounded-lg text-xs flex-1", isSameDay(date, d) ? "bg-ios-primary text-white" : "bg-white dark:bg-zinc-700")}>{offset === 0 ? '今天' : offset === -1 ? '昨天' : '明天'}</button>); })}<div className="text-xs flex items-center px-2 text-ios-subtext">{format(date, 'yyyy/MM/dd')}</div></div>}</div>
                    <div className="space-y-3 pt-4 border-t border-gray-100 dark:border-zinc-800"><div className="flex items-center justify-between"><span className="font-medium text-sm">修改备注</span><input type="checkbox" checked={updateNote} onChange={(e) => setUpdateNote(e.target.checked)} className="accent-ios-primary w-5 h-5" /></div>{updateNote && <input type="text" placeholder="输入新备注..." value={note} onChange={(e) => { setNote(e.target.value); setUpdateNote(true); }} className="w-full p-3 bg-gray-100 dark:bg-zinc-800 rounded-xl text-sm outline-none focus:ring-2 focus:ring-ios-primary/20" />}</div>
                </div>
            </div>
        </div>
    );
}
