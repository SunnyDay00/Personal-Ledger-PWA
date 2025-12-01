import React, { useState, useMemo } from 'react';
import { useApp } from '../contexts/AppContext';
import { Icon } from './ui/Icon';
import { formatCurrency, getWeekRange, getMonthRange, getYearRange } from '../utils';
import {
    addWeeks, addMonths, addYears, format, getMonth
} from 'date-fns';
import {
    PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    LineChart, Line
} from 'recharts';
import { clsx } from 'clsx';
import { Transaction } from '../types';
import { CloudSyncButton } from './CloudSyncButton';

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white/90 dark:bg-zinc-800/90 backdrop-blur-md p-3 rounded-xl shadow-xl border border-gray-100 dark:border-zinc-700 min-w-[120px]">
                {label && <p className="text-xs text-ios-subtext mb-1.5">{label}</p>}
                {payload.map((entry: any, index: number) => (
                    <div key={index} className="flex items-center justify-between gap-3 text-sm mb-0.5 last:mb-0">
                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color || entry.payload.fill }}></div>
                            <span className="text-ios-text opacity-90">{entry.name}</span>
                        </div>
                        <span className="font-semibold tabular-nums text-ios-text">{formatCurrency(entry.value)}</span>
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

export const StatsView: React.FC = () => {
    const { state, dispatch } = useApp();
    const { transactions, ledgers, categories, settings, currentLedgerId, timeRange, currentDate: currentDateTs } = state;
    const currentDate = new Date(currentDateTs);

    // Local state for stats view only
    // const [selectedLedgerId, setSelectedLedgerId] = useState<string | 'all'>(state.currentLedgerId); // Removed
    // const [timeRange, setTimeRange] = useState<'week' | 'month' | 'year'>('month'); // Removed
    // const [currentDate, setCurrentDate] = useState(new Date()); // Removed
    const [chartType, setChartType] = useState<'pie' | 'bar' | 'line'>('pie');
    const [pieType, setPieType] = useState<'expense' | 'income'>('expense');
    const [viewMode, setViewMode] = useState<'category' | 'group'>('category');
    const [showLedgerMenu, setShowLedgerMenu] = useState(false);

    // Helper to get range
    // Stable memoization of start/end objects
    const { start, end } = useMemo(() => {
        if (timeRange === 'week') return getWeekRange(currentDate);
        if (timeRange === 'year') return getYearRange(currentDate);
        return getMonthRange(currentDate);
    }, [timeRange, currentDate]);

    // Date Navigation
    // Date Navigation
    const handlePrev = () => {
        let newDate;
        if (timeRange === 'week') newDate = addWeeks(currentDate, -1);
        else if (timeRange === 'month') newDate = addMonths(currentDate, -1);
        else newDate = addYears(currentDate, -1);
        dispatch({ type: 'SET_CURRENT_DATE', payload: newDate.getTime() });
    };

    const handleNext = () => {
        let newDate;
        if (timeRange === 'week') newDate = addWeeks(currentDate, 1);
        else if (timeRange === 'month') newDate = addMonths(currentDate, 1);
        else newDate = addYears(currentDate, 1);
        dispatch({ type: 'SET_CURRENT_DATE', payload: newDate.getTime() });
    };

    const displayDate = useMemo(() => {
        if (timeRange === 'year') return format(currentDate, 'yyyy年');
        if (timeRange === 'month') return format(currentDate, 'yyyy年MM月');
        const { start: s, end: e } = getWeekRange(currentDate);
        return `${format(s, 'MM.dd')} - ${format(e, 'MM.dd')}`;
    }, [timeRange, currentDate]);

    // Data Filtering
    // Use timestamps primitives to avoid object reference loop
    const startTimestamp = start.getTime();
    const endTimestamp = end.getTime();

    const filteredData = useMemo(() => {
        return transactions.filter(t => {
            const isLedgerMatch = t.ledgerId === currentLedgerId;
            const isDateMatch = t.date >= startTimestamp && t.date <= endTimestamp;
            return isLedgerMatch && isDateMatch;
        });
    }, [transactions, currentLedgerId, startTimestamp, endTimestamp]);

    // Global Ledger Stats (Total counts for the selected ledger, ignoring date range)
    const ledgerTotalStats = useMemo(() => {
        const targetTxs = transactions.filter(t =>
            t.ledgerId === currentLedgerId
        );
        return {
            total: targetTxs.length,
            expense: targetTxs.filter(t => t.type === 'expense').length,
            income: targetTxs.filter(t => t.type === 'income').length
        };
    }, [transactions, currentLedgerId]);

    // Metrics
    const { income, expense, balance } = useMemo(() => {
        const res = filteredData.reduce((acc, t) => {
            if (t.type === 'income') acc.income += t.amount;
            else acc.expense += t.amount;
            return acc;
        }, { income: 0, expense: 0 });
        return { ...res, balance: res.income - res.expense };
    }, [filteredData]);

    // Chart Data Preparation
    const chartData = useMemo(() => {
        if (chartType === 'pie') {
            // Group by Category based on selected pieType
            const map: Record<string, number> = {};
            const targetTxs = filteredData.filter(t => t.type === pieType);
            if (viewMode === 'group') {
                const groupMap: Record<string, string[]> = {};
                state.categoryGroups.forEach(g => { groupMap[g.id] = g.categoryIds || []; });
                targetTxs.forEach(t => {
                    const group = state.categoryGroups.find(g => g.categoryIds?.includes(t.categoryId) && !g.isDeleted);
                    const key = group ? group.name : '未分组';
                    map[key] = (map[key] || 0) + t.amount;
                });
            } else {
                targetTxs.forEach(t => {
                    const catName = categories.find(c => c.id === t.categoryId)?.name || '未知';
                    map[catName] = (map[catName] || 0) + t.amount;
                });
            }
            return Object.entries(map)
                .map(([name, value]) => ({ name, value }))
                .sort((a, b) => b.value - a.value);
        } else {
            // Time Series (Bar/Line) - Income vs Expense
            const map: Record<string, { income: number; expense: number; label: string }> = {};

            if (timeRange === 'year') {
                // Group by Month
                for (let i = 0; i < 12; i++) {
                    const label = `${i + 1}月`;
                    map[i] = { income: 0, expense: 0, label };
                }
                filteredData.forEach(t => {
                    const month = getMonth(t.date);
                    if (t.type === 'income') map[month].income += t.amount;
                    else map[month].expense += t.amount;
                });
            } else {
                // Group by Day
                // Init days
                let curr = new Date(start);
                while (curr <= end) {
                    const key = format(curr, 'yyyy-MM-dd');
                    const label = format(curr, 'dd');
                    map[key] = { income: 0, expense: 0, label };
                    curr.setDate(curr.getDate() + 1);
                }
                filteredData.forEach(t => {
                    const key = format(t.date, 'yyyy-MM-dd');
                    if (map[key]) {
                        if (t.type === 'income') map[key].income += t.amount;
                        else map[key].expense += t.amount;
                    }
                });
            }
            return Object.values(map);
        }
    }, [filteredData, chartType, timeRange, start, end, categories, pieType, viewMode, state.categoryGroups]);

    // Extreme Values - Explicitly typed to prevent "type 'never'" errors during build
    const extremes = useMemo((): {
        maxExpTx: Transaction | null;
        maxIncTx: Transaction | null;
        maxExpPeriod: { date: string; amount: number } | null;
        maxIncPeriod: { date: string; amount: number } | null;
    } | null => {
        if (filteredData.length === 0) return null;

        let maxExpTx: Transaction | null = null;
        let maxIncTx: Transaction | null = null;

        const dayMap: Record<string, { inc: number, exp: number }> = {};

        filteredData.forEach(t => {
            // Single Tx
            if (t.type === 'expense') {
                if (!maxExpTx || t.amount > maxExpTx.amount) maxExpTx = t;
            } else {
                if (!maxIncTx || t.amount > maxIncTx.amount) maxIncTx = t;
            }

            // Grouping for Day/Month
            const key = timeRange === 'year' ? format(t.date, 'yyyy-MM') : format(t.date, 'yyyy-MM-dd');
            if (!dayMap[key]) dayMap[key] = { inc: 0, exp: 0 };
            if (t.type === 'income') dayMap[key].inc += t.amount;
            else dayMap[key].exp += t.amount;
        });

        const sortedByExp = Object.entries(dayMap).sort((a, b) => b[1].exp - a[1].exp);
        const sortedByInc = Object.entries(dayMap).sort((a, b) => b[1].inc - a[1].inc);

        return {
            maxExpTx,
            maxIncTx,
            maxExpPeriod: sortedByExp[0] ? { date: sortedByExp[0][0], amount: sortedByExp[0][1].exp } : null,
            maxIncPeriod: sortedByInc[0] ? { date: sortedByInc[0][0], amount: sortedByInc[0][1].inc } : null,
        };
    }, [filteredData, timeRange]);

    // Advanced Stats
    const advancedStats = useMemo(() => {
        if (filteredData.length === 0) return { createdDate: Date.now(), topCat: null, avgDaily: 0, avgIncomeDaily: 0, avgTx: 0 };

        // 1. Ledger Creation Info
        let createdDate = Date.now();
        const l = ledgers.find(l => l.id === currentLedgerId);
        if (l) createdDate = l.createdAt;

        // 2. Most Frequent Category
        const catCounts: Record<string, number> = {};
        filteredData.forEach(t => {
            const catName = categories.find(c => c.id === t.categoryId)?.name || '未知';
            catCounts[catName] = (catCounts[catName] || 0) + 1;
        });
        const topCatEntry = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0];
        const topCat = topCatEntry ? { name: topCatEntry[0], count: topCatEntry[1] } : null;

        // 3. Avg Daily Spending
        const totalExp = filteredData.reduce((acc, t) => t.type === 'expense' ? acc + t.amount : acc, 0);
        const totalInc = filteredData.reduce((acc, t) => t.type === 'income' ? acc + t.amount : acc, 0);
        const msPerDay = 1000 * 60 * 60 * 24;
        // Calculate active days in range (or just total days in period? Usually total days in period is more meaningful for "Daily Budget")
        const periodDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / msPerDay));
        const avgDaily = totalExp / periodDays;
        const avgIncomeDaily = totalInc / periodDays;

        // 4. Avg Transaction Amount (General)
        const totalAmount = filteredData.reduce((acc, t) => acc + t.amount, 0);
        const avgTx = totalAmount / filteredData.length;

        return { createdDate, topCat, avgDaily, avgIncomeDaily, avgTx };
    }, [filteredData, start, end, currentLedgerId, ledgers, categories]);

    const COLORS = ['#007AFF', '#FF9500', '#34C759', '#AF52DE', '#FF2D55', '#5856D6', '#5AC8FA'];

    const selectedLedgerName = ledgers.find(l => l.id === currentLedgerId)?.name || '未知账本';

    const currentPieTotal = pieType === 'expense' ? expense : income;

    return (
        <div className={clsx("h-full w-full bg-ios-bg", settings.enableAnimations && "animate-slide-up")}>
            {/* Header - Fixed & Glassmorphism */}
            <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-center pt-[env(safe-area-inset-top)] h-[calc(env(safe-area-inset-top)+3.5rem)] bg-ios-bg/80 backdrop-blur-xl border-b border-black/5 dark:border-white/5 transition-colors">
                <div className="absolute left-4">
                    <button
                        onClick={() => setShowLedgerMenu(!showLedgerMenu)}
                        className="flex items-center space-x-2 bg-white/50 dark:bg-zinc-800/50 backdrop-blur-md px-3 py-1.5 rounded-full shadow-sm"
                    >
                        <span className="text-sm font-bold text-ios-text max-w-[100px] truncate">{selectedLedgerName}</span>
                        <Icon name="ChevronDown" className="w-3 h-3 text-ios-subtext" />
                    </button>
                    {showLedgerMenu && (
                        <div className="absolute top-full mt-2 left-0 w-48 bg-white dark:bg-zinc-800 rounded-xl shadow-xl border border-gray-100 dark:border-zinc-700 overflow-hidden animate-fade-in z-50">
                            {ledgers.map(l => (
                                <button
                                    key={l.id}
                                    onClick={() => { dispatch({ type: 'SET_LEDGER', payload: l.id }); setShowLedgerMenu(false); }}
                                    className="w-full text-left px-4 py-3 text-sm hover:bg-gray-50 dark:hover:bg-zinc-700 flex justify-between items-center"
                                >
                                    <span className="truncate">{l.name}</span>
                                    {l.id === currentLedgerId && <Icon name="Check" className="w-3 h-3 text-ios-primary" />}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <h1 className="text-base font-semibold text-ios-text">统计</h1>

                {/* Cloud Status Icon */}
                <div className="absolute right-4">
                    <CloudSyncButton />
                </div>
            </div>

            {/* Main Content - Scrollable */}
            <div
                className="h-full w-full overflow-y-auto no-scrollbar px-4 pt-[calc(env(safe-area-inset-top)+4.5rem)] pb-[calc(env(safe-area-inset-bottom)+6rem)]"
                style={{ WebkitOverflowScrolling: 'touch' }}
            >
                <div>
                    {/* Date Controls */}
                    <div className="mb-4">
                        <div className="flex justify-between items-center mb-3 px-2">
                            <button onClick={handlePrev} className="p-1"><Icon name="ChevronLeft" className="w-5 h-5 text-ios-subtext" /></button>
                            <span className="text-sm font-medium text-ios-text tabular-nums">{displayDate}</span>
                            <button onClick={handleNext} className="p-1"><Icon name="ChevronRight" className="w-5 h-5 text-ios-subtext" /></button>
                        </div>
                        <div className="flex justify-center bg-gray-200/50 dark:bg-zinc-800/50 p-0.5 rounded-lg">
                            {(['week', 'month', 'year'] as const).map(range => (
                                <button
                                    key={range}
                                    onClick={() => dispatch({ type: 'SET_TIME_RANGE', payload: range })}
                                    className={clsx(
                                        "flex-1 py-1 text-xs font-medium rounded-md transition-all",
                                        timeRange === range ? "bg-white dark:bg-zinc-700 shadow-sm text-ios-text" : "text-ios-subtext"
                                    )}
                                >
                                    {range === 'week' ? '周' : range === 'month' ? '月' : '年'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Ledger Info Card */}
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 shadow-sm border border-ios-border mb-3">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-ios-primary">
                                <Icon name="BookOpen" className="w-4 h-4" />
                            </div>
                            <div>
                                <div className="text-xs text-ios-subtext">账本创建时间</div>
                                <div className="text-sm font-medium">{format(advancedStats.createdDate, 'yyyy-MM-dd')}</div>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 border-t border-gray-100 dark:border-zinc-800 pt-3">
                            <div className="flex flex-col items-center">
                                <span className="text-[10px] text-ios-subtext mb-0.5">总笔数</span>
                                <span className="text-sm font-bold tabular-nums text-ios-text">{ledgerTotalStats.total}</span>
                            </div>
                            <div className="flex flex-col items-center border-l border-gray-100 dark:border-zinc-800">
                                <span className="text-[10px] text-ios-subtext mb-0.5">支出笔数</span>
                                <span className="text-sm font-bold tabular-nums text-red-500">{ledgerTotalStats.expense}</span>
                            </div>
                            <div className="flex flex-col items-center border-l border-gray-100 dark:border-zinc-800">
                                <span className="text-[10px] text-ios-subtext mb-0.5">收入笔数</span>
                                <span className="text-sm font-bold tabular-nums text-green-500">{ledgerTotalStats.income}</span>
                            </div>
                        </div>
                    </div>

                    {/* Summary Cards */}
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
                            <span className="text-sm font-bold text-ios-primary tabular-nums">{formatCurrency(balance)}</span>
                        </div>
                    </div>

                    {/* Chart Section */}
                    <div className="bg-white dark:bg-zinc-900 rounded-3xl p-5 shadow-sm border border-ios-border mb-6">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xs font-semibold text-ios-subtext uppercase">
                                {chartType === 'pie' ? (pieType === 'expense' ? '支出占比' : '收入占比') : chartType === 'bar' ? '收支对比' : '收支走势'}
                            </h3>
                            <div className="flex bg-gray-100 dark:bg-zinc-800 rounded-lg p-0.5">
                                <button onClick={() => setChartType('pie')} className={clsx("p-1.5 rounded-md", chartType === 'pie' ? "bg-white dark:bg-zinc-700 shadow-sm text-ios-primary" : "text-ios-subtext")}>
                                    <Icon name="PieChart" className="w-4 h-4" />
                                </button>
                                <button onClick={() => setChartType('bar')} className={clsx("p-1.5 rounded-md", chartType === 'bar' ? "bg-white dark:bg-zinc-700 shadow-sm text-ios-primary" : "text-ios-subtext")}>
                                    <Icon name="BarChart2" className="w-4 h-4" />
                                </button>
                                <button onClick={() => setChartType('line')} className={clsx("p-1.5 rounded-md", chartType === 'line' ? "bg-white dark:bg-zinc-700 shadow-sm text-ios-primary" : "text-ios-subtext")}>
                                    <Icon name="LineChart" className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Pie Chart Type Toggle */}
                        {chartType === 'pie' && (
                            <div className="flex justify-between items-center mb-4 gap-3">
                                <div className="flex bg-gray-100 dark:bg-zinc-800 p-0.5 rounded-lg">
                                    <button onClick={() => setPieType('expense')} className={clsx("px-4 py-1 text-xs font-medium rounded-md transition-all", pieType === 'expense' ? "bg-white dark:bg-zinc-700 shadow-sm text-ios-text" : "text-ios-subtext")}>支出</button>
                                    <button onClick={() => setPieType('income')} className={clsx("px-4 py-1 text-xs font-medium rounded-md transition-all", pieType === 'income' ? "bg-white dark:bg-zinc-700 shadow-sm text-ios-text" : "text-ios-subtext")}>收入</button>
                                </div>
                                <div className="flex bg-gray-100 dark:bg-zinc-800 p-0.5 rounded-lg">
                                    <button onClick={() => setViewMode('category')} className={clsx("px-3 py-1 text-xs font-medium rounded-md transition-all", viewMode === 'category' ? "bg-white dark:bg-zinc-700 shadow-sm text-ios-text" : "text-ios-subtext")}>按分类</button>
                                    <button onClick={() => setViewMode('group')} className={clsx("px-3 py-1 text-xs font-medium rounded-md transition-all", viewMode === 'group' ? "bg-white dark:bg-zinc-700 shadow-sm text-ios-text" : "text-ios-subtext")}>按分组</button>
                                </div>
                            </div>
                        )}

                        <div className="h-64 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                {chartType === 'pie' ? (
                                    <PieChart>
                                        <Pie data={chartData} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                                            {chartData.map((entry: any, index: number) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
                                            ))}
                                        </Pie>
                                        <Tooltip content={<CustomTooltip />} />
                                    </PieChart>
                                ) : chartType === 'bar' ? (
                                    <BarChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} />
                                        <Tooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} content={<CustomTooltip />} />
                                        <Bar dataKey="income" name="收入" fill="#34C759" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                        <Bar dataKey="expense" name="支出" fill="#FF3B30" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                    </BarChart>
                                ) : (
                                    <LineChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Line type="monotone" dataKey="income" name="收入" stroke="#34C759" strokeWidth={2} dot={false} />
                                        <Line type="monotone" dataKey="expense" name="支出" stroke="#FF3B30" strokeWidth={2} dot={false} />
                                    </LineChart>
                                )}
                            </ResponsiveContainer>
                        </div>

                        {/* Category List below Pie Chart */}
                        {chartType === 'pie' && (
                            <div className="mt-4 space-y-3">
                                {chartData.length === 0 && <div className="text-center text-xs text-ios-subtext py-4">暂无数据</div>}
                                {chartData.map((item: any, idx: number) => (
                                    <div key={idx} className="flex items-center justify-between text-sm">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></div>
                                            <span>{item.name}</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-xs text-ios-subtext">{currentPieTotal > 0 ? Math.round((item.value / currentPieTotal) * 100) : 0}%</span>
                                            <span className="font-medium tabular-nums">{formatCurrency(item.value)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Advanced Stats Grid */}
                    {filteredData.length > 0 && (
                        <div className="grid grid-cols-2 gap-3 mb-6">
                            <ExtremeCard
                                title="日均支出"
                                amount={advancedStats.avgDaily}
                                desc="本周期内平均"
                                icon="TrendingDown"
                                color="text-orange-500"
                                bg="bg-orange-50 dark:bg-orange-900/10"
                            />
                            <ExtremeCard
                                title="日均收入"
                                amount={advancedStats.avgIncomeDaily}
                                desc="本周期内平均"
                                icon="TrendingUp"
                                color="text-green-500"
                                bg="bg-green-50 dark:bg-green-900/10"
                            />
                            <ExtremeCard
                                title="最频分类"
                                desc={advancedStats.topCat ? `${advancedStats.topCat.name} (${advancedStats.topCat.count}次)` : '-'}
                                icon="Tag"
                                color="text-purple-500"
                                bg="bg-purple-50 dark:bg-purple-900/10"
                            />
                            <ExtremeCard
                                title="平均交易额"
                                amount={advancedStats.avgTx}
                                desc="笔均金额"
                                icon="CreditCard"
                                color="text-blue-500"
                                bg="bg-blue-50 dark:bg-blue-900/10"
                            />
                        </div>
                    )}
                    {/* Extreme Stats */}
                    {extremes && (
                        <div className="space-y-4">
                            <h3 className="text-xs font-semibold text-ios-subtext uppercase px-2">极值统计</h3>
                            <div className="grid grid-cols-2 gap-3">
                                <ExtremeCard
                                    title="单笔最高支出"
                                    amount={extremes.maxExpTx?.amount}
                                    desc={extremes.maxExpTx ? `${categories.find(c => c.id === extremes.maxExpTx!.categoryId)?.name} · ${format(extremes.maxExpTx.date, 'MM-dd')}` : '-'}
                                    icon="ArrowDownCircle"
                                    color="text-red-500"
                                    bg="bg-red-50 dark:bg-red-900/10"
                                />
                                <ExtremeCard
                                    title="单笔最高收入"
                                    amount={extremes.maxIncTx?.amount}
                                    desc={extremes.maxIncTx ? `${categories.find(c => c.id === extremes.maxIncTx!.categoryId)?.name} · ${format(extremes.maxIncTx.date, 'MM-dd')}` : '-'}
                                    icon="ArrowUpCircle"
                                    color="text-green-500"
                                    bg="bg-green-50 dark:bg-green-900/10"
                                />
                                <ExtremeCard
                                    title={`支出最高${timeRange === 'year' ? '月' : '天'}`}
                                    amount={extremes.maxExpPeriod?.amount}
                                    desc={extremes.maxExpPeriod ? extremes.maxExpPeriod.date : '-'}
                                    icon="Calendar"
                                    color="text-orange-500"
                                    bg="bg-orange-50 dark:bg-orange-900/10"
                                />
                                <ExtremeCard
                                    title={`收入最高${timeRange === 'year' ? '月' : '天'}`}
                                    amount={extremes.maxIncPeriod?.amount}
                                    desc={extremes.maxIncPeriod ? extremes.maxIncPeriod.date : '-'}
                                    icon="Wallet"
                                    color="text-blue-500"
                                    bg="bg-blue-50 dark:bg-blue-900/10"
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const ExtremeCard: React.FC<{ title: string; amount?: number; desc: string; icon: string; color: string; bg: string }> = ({ title, amount, desc, icon, color, bg }) => (
    <div className="bg-white dark:bg-zinc-900 p-3 rounded-2xl shadow-sm border border-ios-border">
        <div className="flex items-center gap-2 mb-2">
            <div className={`w-6 h-6 rounded-full ${bg} flex items-center justify-center`}>
                <Icon name={icon} className={`w-3.5 h-3.5 ${color}`} />
            </div>
            <span className="text-[10px] text-ios-subtext">{title}</span>
        </div>
        <div className="font-bold text-sm tabular-nums mb-0.5">{amount !== undefined ? formatCurrency(amount) : desc}</div>
        {amount !== undefined && <div className="text-[10px] text-ios-subtext truncate">{desc}</div>}
    </div>
);

