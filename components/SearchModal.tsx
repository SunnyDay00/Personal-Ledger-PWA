
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useApp } from '../contexts/AppContext';
import { Icon } from './ui/Icon';
import { formatCurrency } from '../utils';
import { format } from 'date-fns';

export const SearchModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { state, dispatch } = useApp();
    const [query, setQuery] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    const history = state.settings.searchHistory;

    // iOS-optimized focus: delay to prevent layout shift
    useEffect(() => {
        const timer = setTimeout(() => {
            if (inputRef.current) {
                inputRef.current.focus({
                    preventScroll: true // Prevent automatic scrolling
                });
            }
        }, 100); // Small delay to let layout stabilize

        return () => clearTimeout(timer);
    }, []);

    const results = useMemo(() => {
        if (!query) return [];
        const lowerQ = query.toLowerCase();
        return state.transactions
            .filter(t =>
                t.note.toLowerCase().includes(lowerQ) ||
                t.amount.toString().includes(lowerQ) ||
                state.categories.find(c => c.id === t.categoryId)?.name.includes(lowerQ)
            )
            .sort((a, b) => b.date - a.date);
    }, [query, state.transactions, state.categories]);

    const handleSearch = (term: string) => {
        setQuery(term);
        if (term.trim()) {
            dispatch({ type: 'ADD_SEARCH_HISTORY', payload: term });
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-ios-bg animate-slide-up flex flex-col">
            <div className="pt-[env(safe-area-inset-top)] px-4 pb-2 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-b border-ios-border">
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
            </div>

            <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
                {/* History */}
                {!query && history.length > 0 && (
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

                {/* Results */}
                {query && (
                    <div className="space-y-3">
                        <h3 className="text-xs font-semibold text-ios-subtext uppercase">搜索结果 ({results.length})</h3>
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
