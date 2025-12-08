
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useApp } from '../contexts/AppContext';
import { Icon } from './ui/Icon';
import { formatCurrency } from '../utils';
import { format } from 'date-fns';

export const SearchModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { state, dispatch } = useApp();
    const [query, setQuery] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    // Filter states
    const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
    const [selectedType, setSelectedType] = useState<'all' | 'expense' | 'income'>('all');
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
    const [selectedGroupId, setSelectedGroupId] = useState<string>('');
    const [amountFilter, setAmountFilter] = useState<{ type: 'none' | 'gt' | 'lt'; value: string }>({ type: 'none', value: '' });
    const [showFilters, setShowFilters] = useState(false);

    const history = state.settings.searchHistory;

    // Categories and groups for current ledger only
    const ledgerCategories = useMemo(() =>
        state.categories.filter(c => c.ledgerId === state.currentLedgerId),
        [state.categories, state.currentLedgerId]
    );
    const ledgerGroups = useMemo(() =>
        state.categoryGroups.filter(g => g.ledgerId === state.currentLedgerId),
        [state.categoryGroups, state.currentLedgerId]
    );

    // Viewport management for iOS keyboard
    const [visualViewport, setVisualViewport] = useState({
        height: typeof window !== 'undefined' ? window.innerHeight : 800,
        offsetTop: 0
    });

    useEffect(() => {
        const handleResize = () => {
            const vv = (window as any).visualViewport;
            if (vv) {
                setVisualViewport({
                    height: vv.height,
                    offsetTop: vv.offsetTop
                });
            } else {
                setVisualViewport({
                    height: window.innerHeight,
                    offsetTop: 0
                });
            }
        };

        if ((window as any).visualViewport) {
            (window as any).visualViewport.addEventListener('resize', handleResize);
            (window as any).visualViewport.addEventListener('scroll', handleResize);
            handleResize();
        } else {
            window.addEventListener('resize', handleResize);
        }

        return () => {
            if ((window as any).visualViewport) {
                (window as any).visualViewport.removeEventListener('resize', handleResize);
                (window as any).visualViewport.removeEventListener('scroll', handleResize);
            } else {
                window.removeEventListener('resize', handleResize);
            }
        };
    }, []);

    // Check if any filter is active
    const hasActiveFilters = dateRange.start || dateRange.end || selectedType !== 'all' || selectedCategoryId || selectedGroupId || (amountFilter.type !== 'none' && amountFilter.value);

    // Filter and search results
    const results = useMemo(() => {
        // Start with current ledger transactions
        let filtered = state.transactions.filter(t => t.ledgerId === state.currentLedgerId);

        // Date range filter
        if (dateRange.start) {
            const startTime = new Date(dateRange.start).getTime();
            filtered = filtered.filter(t => t.date >= startTime);
        }
        if (dateRange.end) {
            const endTime = new Date(dateRange.end).getTime() + 86399999; // End of day
            filtered = filtered.filter(t => t.date <= endTime);
        }

        // Type filter
        if (selectedType !== 'all') {
            filtered = filtered.filter(t => t.type === selectedType);
        }

        // Category filter
        if (selectedCategoryId) {
            filtered = filtered.filter(t => t.categoryId === selectedCategoryId);
        }

        // Category group filter
        if (selectedGroupId) {
            const group = state.categoryGroups.find(g => g.id === selectedGroupId);
            if (group && group.categoryIds) {
                filtered = filtered.filter(t => group.categoryIds.includes(t.categoryId));
            }
        }

        // Amount filter
        if (amountFilter.type !== 'none' && amountFilter.value) {
            const amountNum = parseFloat(amountFilter.value);
            if (!isNaN(amountNum)) {
                if (amountFilter.type === 'gt') {
                    filtered = filtered.filter(t => t.amount > amountNum);
                } else if (amountFilter.type === 'lt') {
                    filtered = filtered.filter(t => t.amount < amountNum);
                }
            }
        }

        // Text search (only if query is present, otherwise show all filtered)
        if (query) {
            const lowerQ = query.toLowerCase();
            filtered = filtered.filter(t =>
                t.note.toLowerCase().includes(lowerQ) ||
                t.amount.toString().includes(lowerQ) ||
                state.categories.find(c => c.id === t.categoryId)?.name.toLowerCase().includes(lowerQ)
            );
        }

        return filtered.sort((a, b) => b.date - a.date);
    }, [query, state.transactions, state.categories, state.categoryGroups, state.currentLedgerId, dateRange, selectedType, selectedCategoryId, selectedGroupId, amountFilter]);

    const handleSearch = (term: string) => {
        setQuery(term);
        if (term.trim()) {
            dispatch({ type: 'ADD_SEARCH_HISTORY', payload: term });
        }
    };

    const clearFilters = () => {
        setDateRange({ start: '', end: '' });
        setSelectedType('all');
        setSelectedCategoryId('');
        setSelectedGroupId('');
        setAmountFilter({ type: 'none', value: '' });
    };

    return (
        <div
            className="fixed left-0 z-50 bg-ios-bg animate-slide-up flex flex-col w-full"
            style={{
                height: visualViewport.height,
                top: visualViewport.offsetTop
            }}
        >
            <div className="pt-[env(safe-area-inset-top)] px-4 pb-2 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-b border-ios-border shrink-0">
                {/* Search Input Row */}
                <div className="flex items-center gap-3 h-14">
                    <div className="flex-1 relative">
                        <Icon name="Search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-subtext" />
                        <input
                            ref={inputRef}
                            type="text"
                            placeholder="搜索金额、分类、备注"
                            className="w-full bg-gray-100 dark:bg-zinc-800 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch(query)}
                        />
                        {query && (
                            <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                                <Icon name="XCircle" className="w-4 h-4 text-ios-subtext fill-gray-200" />
                            </button>
                        )}
                    </div>
                    <button onClick={onClose} className="text-ios-primary font-medium text-sm">取消</button>
                </div>

                {/* Filter Chips Row */}
                <div className="flex items-center gap-2 pb-2 overflow-x-auto no-scrollbar">
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${hasActiveFilters
                            ? 'bg-ios-primary text-white'
                            : 'bg-gray-100 dark:bg-zinc-800 text-ios-text'
                            }`}
                    >
                        <Icon name="Filter" className="w-3 h-3" />
                        筛选
                        {hasActiveFilters && (
                            <span className="ml-1 bg-white/20 px-1.5 rounded-full">
                                {[dateRange.start || dateRange.end, selectedType !== 'all', selectedCategoryId, selectedGroupId].filter(Boolean).length}
                            </span>
                        )}
                    </button>

                    {/* Quick filter chips */}
                    {hasActiveFilters && (
                        <>
                            {(dateRange.start || dateRange.end) && (
                                <span className="shrink-0 px-2.5 py-1 rounded-full text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                                    {dateRange.start && dateRange.end
                                        ? `${dateRange.start} ~ ${dateRange.end}`
                                        : dateRange.start ? `${dateRange.start} 起` : `至 ${dateRange.end}`
                                    }
                                </span>
                            )}
                            {selectedType !== 'all' && (
                                <span className="shrink-0 px-2.5 py-1 rounded-full text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
                                    {selectedType === 'expense' ? '支出' : '收入'}
                                </span>
                            )}
                            {selectedCategoryId && (
                                <span className="shrink-0 px-2.5 py-1 rounded-full text-xs bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
                                    {ledgerCategories.find(c => c.id === selectedCategoryId)?.name || '分类'}
                                </span>
                            )}
                            {selectedGroupId && (
                                <span className="shrink-0 px-2.5 py-1 rounded-full text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400">
                                    {ledgerGroups.find(g => g.id === selectedGroupId)?.name || '分类组'}
                                </span>
                            )}
                            {amountFilter.type !== 'none' && amountFilter.value && (
                                <span className="shrink-0 px-2.5 py-1 rounded-full text-xs bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400">
                                    {amountFilter.type === 'gt' ? '>' : '<'} {amountFilter.value}元
                                </span>
                            )}
                            <button
                                onClick={clearFilters}
                                className="shrink-0 px-2 py-1 text-xs text-ios-subtext"
                            >
                                清除
                            </button>
                        </>
                    )}
                </div>

                {/* Expanded Filter Panel */}
                {showFilters && (
                    <div className="py-3 space-y-4 animate-in slide-in-from-top-2">
                        {/* Date Range - Two Rows */}
                        <div>
                            <label className="text-xs text-ios-subtext mb-1.5 block">日期范围</label>
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-ios-subtext w-12">开始</span>
                                    <input
                                        type="date"
                                        value={dateRange.start}
                                        onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                                        className="flex-1 px-3 py-2 text-sm bg-gray-100 dark:bg-zinc-800 rounded-lg focus:outline-none"
                                    />
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-ios-subtext w-12">结束</span>
                                    <input
                                        type="date"
                                        value={dateRange.end}
                                        onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                                        className="flex-1 px-3 py-2 text-sm bg-gray-100 dark:bg-zinc-800 rounded-lg focus:outline-none"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Amount Filter */}
                        <div>
                            <label className="text-xs text-ios-subtext mb-1.5 block">金额筛选</label>
                            <div className="flex gap-2">
                                {(['none', 'gt', 'lt'] as const).map(type => (
                                    <button
                                        key={type}
                                        onClick={() => setAmountFilter(prev => ({ ...prev, type }))}
                                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${amountFilter.type === type
                                            ? 'bg-ios-primary text-white'
                                            : 'bg-gray-100 dark:bg-zinc-800 text-ios-text'
                                            }`}
                                    >
                                        {type === 'none' ? '不限' : type === 'gt' ? '大于' : '小于'}
                                    </button>
                                ))}
                                {amountFilter.type !== 'none' && (
                                    <input
                                        type="number"
                                        value={amountFilter.value}
                                        onChange={(e) => setAmountFilter(prev => ({ ...prev, value: e.target.value }))}
                                        placeholder="输入金额"
                                        className="flex-1 px-3 py-2 text-sm bg-gray-100 dark:bg-zinc-800 rounded-lg focus:outline-none"
                                    />
                                )}
                            </div>
                        </div>

                        {/* Type Filter */}
                        <div>
                            <label className="text-xs text-ios-subtext mb-1.5 block">类型</label>
                            <div className="flex gap-2">
                                {(['all', 'expense', 'income'] as const).map(type => (
                                    <button
                                        key={type}
                                        onClick={() => setSelectedType(type)}
                                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${selectedType === type
                                            ? 'bg-ios-primary text-white'
                                            : 'bg-gray-100 dark:bg-zinc-800 text-ios-text'
                                            }`}
                                    >
                                        {type === 'all' ? '全部' : type === 'expense' ? '支出' : '收入'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Category Filter */}
                        <div>
                            <label className="text-xs text-ios-subtext mb-1.5 block">分类</label>
                            <div className="flex gap-2 flex-wrap">
                                <button
                                    onClick={() => setSelectedCategoryId('')}
                                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${!selectedCategoryId
                                        ? 'bg-ios-primary text-white'
                                        : 'bg-gray-100 dark:bg-zinc-800 text-ios-text'
                                        }`}
                                >
                                    全部
                                </button>
                                {ledgerCategories.map(cat => (
                                    <button
                                        key={cat.id}
                                        onClick={() => setSelectedCategoryId(cat.id)}
                                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1 ${selectedCategoryId === cat.id
                                            ? 'bg-ios-primary text-white'
                                            : 'bg-gray-100 dark:bg-zinc-800 text-ios-text'
                                            }`}
                                    >
                                        <Icon name={cat.icon || 'Circle'} className="w-3 h-3" />
                                        {cat.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Category Group Filter */}
                        {ledgerGroups.length > 0 && (
                            <div>
                                <label className="text-xs text-ios-subtext mb-1.5 block">分类组</label>
                                <div className="flex gap-2 flex-wrap">
                                    <button
                                        onClick={() => setSelectedGroupId('')}
                                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${!selectedGroupId
                                            ? 'bg-ios-primary text-white'
                                            : 'bg-gray-100 dark:bg-zinc-800 text-ios-text'
                                            }`}
                                    >
                                        全部
                                    </button>
                                    {ledgerGroups.map(group => (
                                        <button
                                            key={group.id}
                                            onClick={() => setSelectedGroupId(group.id)}
                                            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${selectedGroupId === group.id
                                                ? 'bg-ios-primary text-white'
                                                : 'bg-gray-100 dark:bg-zinc-800 text-ios-text'
                                                }`}
                                        >
                                            {group.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
                {/* History - only show when no query and no filters */}
                {!query && !hasActiveFilters && history.length > 0 && (
                    <div className="mb-6">
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="text-xs font-semibold text-ios-subtext uppercase">搜索历史</h3>
                            <button onClick={() => dispatch({ type: 'CLEAR_SEARCH_HISTORY' })} className="text-xs text-ios-primary">清空</button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {history.map((term, i) => (
                                <button
                                    key={i}
                                    onClick={() => setQuery(term)}
                                    className="bg-white dark:bg-zinc-800 px-3 py-1.5 rounded-full text-xs text-ios-text shadow-sm"
                                >
                                    {term}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Results - show when query or filters are active */}
                {(query || hasActiveFilters) && (
                    <div className="space-y-3">
                        <h3 className="text-xs font-semibold text-ios-subtext uppercase">
                            {query ? '搜索结果' : '筛选结果'} ({results.length})
                        </h3>
                        {results.map(t => {
                            const cat = state.categories.find(c => c.id === t.categoryId);
                            const ledger = state.ledgers.find(l => l.id === t.ledgerId);
                            return (
                                <div key={t.id} className="bg-white dark:bg-zinc-800 rounded-xl p-3 flex items-center justify-between shadow-sm">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-zinc-700 flex items-center justify-center">
                                            <Icon name={cat?.icon || 'Circle'} className="w-4 h-4 text-ios-primary" />
                                        </div>
                                        <div>
                                            <div className="text-sm font-medium">{cat?.name}</div>
                                            <div className="text-xs text-ios-subtext">{format(t.date, 'yyyy-MM-dd')} · {t.note || '无备注'} · {ledger?.name}</div>
                                        </div>
                                    </div>
                                    <span className={`tabular-nums font-medium ${t.type === 'expense' ? 'text-ios-text' : 'text-green-500'}`}>
                                        {t.type === 'expense' ? '-' : '+'}{formatCurrency(t.amount)}
                                    </span>
                                </div>
                            )
                        })}
                        {results.length === 0 && (
                            <div className="text-center py-10 text-ios-subtext">未找到相关记录</div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
