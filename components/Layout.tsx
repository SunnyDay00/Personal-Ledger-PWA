import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { HomeView } from './HomeView';
import { SettingsView } from './SettingsView';
import { AddView } from './AddView';
import { OnboardingView } from './OnboardingView';
import { SearchModal } from './SearchModal';
import { BudgetModal } from './BudgetModal';
import { LedgerManageView } from './LedgerManageView';
import { Icon } from './ui/Icon';
import { Toast } from './ui/Toast';
import { useApp } from '../contexts/AppContext';
import { clsx } from 'clsx';
import { feedback } from '../services/feedback';
import { App, URLOpenListenerEvent } from '@capacitor/app';
import { Clipboard } from '@capacitor/clipboard';
import { Transaction, TransactionType } from '../types';
import { LiquidFilter } from './LiquidFilter';
import { isTradingLedger } from '../services/ledgerUtils';
import { syncIosHomeQuickActions } from '../services/homeQuickActions';

type HomeJumpTarget = {
    transactionId: string;
    nonce: number;
};

const ADD_LONG_PRESS_MS = 450;
const STATS_LONG_PRESS_MS = 500;
const STATS_MODE_STORAGE_KEY = 'personal-ledger-stats-mode';

const readStoredStatsMode = (): 'stats' | 'ai' => {
    if (typeof window === 'undefined') return 'stats';
    try {
        return window.localStorage.getItem(STATS_MODE_STORAGE_KEY) === 'ai' ? 'ai' : 'stats';
    } catch {
        return 'stats';
    }
};

const persistStatsMode = (mode: 'stats' | 'ai') => {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(STATS_MODE_STORAGE_KEY, mode);
    } catch {
        // Keep the in-memory mode even when persistent storage is unavailable.
    }
};

const StatsView = React.lazy(() => import('./StatsView').then(module => ({ default: module.StatsView })));
const AIView = React.lazy(() => import('./AIView').then(module => ({ default: module.AIView })));

export const Layout: React.FC = () => {
    const { state, dispatch, canUndo, undo } = useApp();
    const [activeTab, setActiveTab] = useState<'home' | 'stats' | 'ledgers' | 'settings'>('home');
    const [statsMode, setStatsMode] = useState<'stats' | 'ai'>(readStoredStatsMode);
    const [hideTabBarForKeyboard, setHideTabBarForKeyboard] = useState(false);
    const [showAdd, setShowAdd] = useState(false);
    const [showSearch, setShowSearch] = useState(false);
    const [showBudget, setShowBudget] = useState(false);
    const [showToast, setShowToast] = useState(false);
    const [initialAddData, setInitialAddData] = useState<Partial<Transaction> | undefined>(undefined);
    const [initialAddType, setInitialAddType] = useState<TransactionType | undefined>(undefined);
    const [initialAddLedgerId, setInitialAddLedgerId] = useState<string | undefined>(undefined);
    const [clipboardImage, setClipboardImage] = useState<string | undefined>(undefined);
    const [homeJumpTarget, setHomeJumpTarget] = useState<HomeJumpTarget | null>(null);
    const [showAddQuickMenu, setShowAddQuickMenu] = useState(false);
    const [showStatsQuickMenu, setShowStatsQuickMenu] = useState(false);
    const addLongPressTimerRef = useRef<number | null>(null);
    const suppressAddClickRef = useRef(false);
    const statsLongPressTimerRef = useRef<number | null>(null);
    const suppressStatsClickRef = useRef(false);
    const ledgersRef = useRef(state.ledgers);
    const categoriesRef = useRef(state.categories);
    const currentLedgerIdRef = useRef(state.currentLedgerId);
    const latestTransactionDeleteId = useMemo(() => {
        const latest = state.operationLogs[0];
        if (!latest || latest.type !== 'delete') return '';
        const details = latest.details || '';
        return details.startsWith('Delete ') || details.startsWith('批量删除 ') ? latest.id : '';
    }, [state.operationLogs]);
    const currentLedger = useMemo(
        () => state.ledgers.find(ledger => ledger.id === state.currentLedgerId),
        [state.ledgers, state.currentLedgerId]
    );
    const isCurrentTradingLedger = isTradingLedger(currentLedger);
    const addQuickActions = useMemo(
        () => isCurrentTradingLedger
            ? [
                { type: 'expense' as TransactionType, label: '添加买入', icon: 'ShoppingCart', accent: 'text-ios-primary' },
                { type: 'income' as TransactionType, label: '添加卖出', icon: 'TrendingUp', accent: 'text-green-500' },
            ]
            : [
                { type: 'expense' as TransactionType, label: '添加支出', icon: 'TrendingDown', accent: 'text-red-500' },
                { type: 'income' as TransactionType, label: '添加收入', icon: 'TrendingUp', accent: 'text-green-500' },
            ],
        [isCurrentTradingLedger]
    );

    const clearAddLongPressTimer = useCallback(() => {
        if (addLongPressTimerRef.current !== null) {
            window.clearTimeout(addLongPressTimerRef.current);
            addLongPressTimerRef.current = null;
        }
    }, []);

    const openAdd = useCallback((type?: TransactionType) => {
        clearAddLongPressTimer();
        setShowAddQuickMenu(false);
        setInitialAddData(undefined);
        setInitialAddType(type);
        setInitialAddLedgerId(undefined);
        setClipboardImage(undefined);
        setShowAdd(true);
        feedback.play('success');
        feedback.vibrate('light');
    }, [clearAddLongPressTimer]);

    const handleAddPointerDown = useCallback(() => {
        clearAddLongPressTimer();
        suppressAddClickRef.current = false;
        addLongPressTimerRef.current = window.setTimeout(() => {
            addLongPressTimerRef.current = null;
            suppressAddClickRef.current = true;
            setShowAddQuickMenu(true);
            feedback.play('switch');
            feedback.vibrate('medium');
        }, ADD_LONG_PRESS_MS);
    }, [clearAddLongPressTimer]);

    const handleAddPointerEnd = useCallback(() => {
        clearAddLongPressTimer();
    }, [clearAddLongPressTimer]);

    const handleAddClick = useCallback(() => {
        if (suppressAddClickRef.current) {
            suppressAddClickRef.current = false;
            return;
        }

        clearAddLongPressTimer();
        const next = !showAddQuickMenu;
        setShowAddQuickMenu(next);
        if (next) {
            feedback.play('switch');
            feedback.vibrate('medium');
        }
    }, [clearAddLongPressTimer, showAddQuickMenu]);

    const handleAddContextMenu = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        clearAddLongPressTimer();
        suppressAddClickRef.current = true;
        setShowAddQuickMenu(true);
        feedback.play('switch');
        feedback.vibrate('medium');
    }, [clearAddLongPressTimer]);

    const clearStatsLongPressTimer = useCallback(() => {
        if (statsLongPressTimerRef.current !== null) {
            window.clearTimeout(statsLongPressTimerRef.current);
            statsLongPressTimerRef.current = null;
        }
    }, []);

    const openStatsQuickMenu = useCallback(() => {
        clearStatsLongPressTimer();
        suppressStatsClickRef.current = true;
        setShowAddQuickMenu(false);
        setShowStatsQuickMenu(true);
        feedback.play('switch');
        feedback.vibrate('medium');
    }, [clearStatsLongPressTimer]);

    const handleStatsPointerDown = useCallback(() => {
        clearStatsLongPressTimer();
        suppressStatsClickRef.current = false;
        statsLongPressTimerRef.current = window.setTimeout(openStatsQuickMenu, STATS_LONG_PRESS_MS);
    }, [clearStatsLongPressTimer, openStatsQuickMenu]);

    const handleStatsPointerEnd = useCallback(() => {
        clearStatsLongPressTimer();
    }, [clearStatsLongPressTimer]);

    const handleStatsContextMenu = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        openStatsQuickMenu();
    }, [openStatsQuickMenu]);

    const selectStatsMode = useCallback((mode: 'stats' | 'ai') => {
        clearStatsLongPressTimer();
        suppressStatsClickRef.current = false;
        setShowStatsQuickMenu(false);
        setShowAddQuickMenu(false);
        setStatsMode(mode);
        persistStatsMode(mode);
        setActiveTab('stats');
    }, [clearStatsLongPressTimer]);

    const handleStatsClick = useCallback(() => {
        if (suppressStatsClickRef.current) {
            suppressStatsClickRef.current = false;
            return;
        }
        clearStatsLongPressTimer();
        setShowStatsQuickMenu(false);
        setShowAddQuickMenu(false);
        setActiveTab('stats');
    }, [clearStatsLongPressTimer]);

    const handleTabSelect = useCallback((tab: 'home' | 'stats' | 'ledgers' | 'settings') => {
        setShowAddQuickMenu(false);
        setShowStatsQuickMenu(false);
        setHideTabBarForKeyboard(false);
        setActiveTab(tab);
    }, []);

    useEffect(() => {
        ledgersRef.current = state.ledgers;
        categoriesRef.current = state.categories;
        currentLedgerIdRef.current = state.currentLedgerId;
    }, [state.ledgers, state.categories, state.currentLedgerId]);

    useEffect(() => {
        void syncIosHomeQuickActions(state.settings.homeQuickActions, state.ledgers);
    }, [state.settings.homeQuickActions, state.ledgers]);

    useEffect(() => () => {
        clearAddLongPressTimer();
        clearStatsLongPressTimer();
    }, [clearAddLongPressTimer, clearStatsLongPressTimer]);

    const openAddFromUrl = useCallback((urlStr?: string) => {
        if (!urlStr || !urlStr.includes('add')) return;

        try {
            // Example: personalledger://add?amount=100&note=Lunch&type=expense&category=Food
            const url = new URL(urlStr);
            const params = url.searchParams;

            const amount = parseFloat(params.get('amount') || '0');
            const note = params.get('note') ? decodeURIComponent(params.get('note')!) : '';
            const typeParam = params.get('type');
            const type = (typeParam === 'income' || typeParam === 'expense') ? typeParam : 'expense';

            const categoryName = params.get('category') ? decodeURIComponent(params.get('category')!) : null;
            const ledgerName = params.get('ledger') ? decodeURIComponent(params.get('ledger')!) : null;
            const ledgerIdParam = params.get('ledgerId') || params.get('ledger_id');

            let categoryId: string | undefined;
            let ledgerId: string | undefined;

            if (ledgerIdParam && ledgersRef.current.some(l => l.id === ledgerIdParam)) {
                ledgerId = ledgerIdParam;
            }

            if (ledgerName) {
                const ledger = ledgersRef.current.find(l => l.name === ledgerName);
                if (ledger) ledgerId = ledger.id;
            }

            const targetLedgerId = ledgerId || currentLedgerIdRef.current;
            const targetLedger = ledgersRef.current.find(l => l.id === targetLedgerId);
            const targetCategoryType = isTradingLedger(targetLedger) ? 'trade' : type;
            if (categoryName) {
                const category = categoriesRef.current.find(c =>
                    c.name === categoryName &&
                    c.ledgerId === targetLedgerId &&
                    c.type === targetCategoryType
                );
                if (category) categoryId = category.id;
            }

            setInitialAddData({
                amount: amount > 0 ? amount : undefined,
                note: note || undefined,
                type,
                categoryId,
                ledgerId,
                date: Date.now()
            });
            setInitialAddType(undefined);
            setInitialAddLedgerId(targetLedgerId);

            setShowAdd(true);
            feedback.play('success');

            Clipboard.read().then(({ type, value }) => {
                if (type === 'image' && value) {
                    setClipboardImage(value);
                } else {
                    setClipboardImage(undefined);
                }
            }).catch(() => setClipboardImage(undefined));
        } catch (e) {
            console.error('Error parsing URL:', e);
        }
    }, []);

    // Handle Deep Links (URL Scheme)
    useEffect(() => {
        let removeListener: (() => void) | undefined;
        let cancelled = false;

        App.addListener('appUrlOpen', (event: URLOpenListenerEvent) => {
            openAddFromUrl(event.url);
        }).then(handle => {
            if (cancelled) {
                handle.remove();
            } else {
                removeListener = () => handle.remove();
            }
        });

        App.getLaunchUrl()
            .then(result => openAddFromUrl(result?.url))
            .catch(() => undefined);

        return () => {
            cancelled = true;
            removeListener?.();
        };
    }, [openAddFromUrl]);

    // Show toast when canUndo becomes true
    useEffect(() => {
        if (canUndo && latestTransactionDeleteId) {
            setShowToast(true);
        }
    }, [canUndo, latestTransactionDeleteId]);

    // Initialize AudioContext on first user interaction
    // Must be synchronous to satisfy browser autoplay policy
    useEffect(() => {
        const initAudio = () => {
            feedback.initAudio();
            // Remove listeners immediately
            window.removeEventListener('click', initAudio);
            window.removeEventListener('keydown', initAudio);
        };

        // Use click and keydown as they are valid user gestures and don't block scrolling like touchstart
        window.addEventListener('click', initAudio, { once: true, passive: true });
        window.addEventListener('keydown', initAudio, { once: true, passive: true });

        return () => {
            window.removeEventListener('click', initAudio);
            window.removeEventListener('keydown', initAudio);
        };
    }, []);

    const handleOpenHomeTransaction = (transaction: Transaction) => {
        dispatch({ type: 'SET_LEDGER', payload: transaction.ledgerId });
        dispatch({ type: 'SET_CURRENT_DATE', payload: transaction.date });
        setHomeJumpTarget({ transactionId: transaction.id, nonce: Date.now() });
        setActiveTab('home');
    };

    if (state.settings.isFirstRun) {
        return <OnboardingView />;
    }

    return (
        <div className="h-full w-full flex flex-col bg-ios-bg text-ios-text overflow-hidden font-sans relative">
            <LiquidFilter />

            {/* Main Content Area */}
            {/* Main takes full height, navigation floats on top at bottom */}
            <main className="h-full w-full overflow-hidden relative">
                {activeTab === 'home' && <HomeView onOpenSearch={() => setShowSearch(true)} onOpenBudget={() => setShowBudget(true)} jumpTarget={homeJumpTarget} onJumpTargetHandled={() => setHomeJumpTarget(null)} />}
                {activeTab === 'stats' && statsMode === 'stats' && (
                    <React.Suspense fallback={
                        <div className="h-full w-full flex items-center justify-center text-ios-subtext">
                            <Icon name="Loader2" className="w-6 h-6 animate-spin" />
                        </div>
                    }>
                        <StatsView onOpenHomeTransaction={handleOpenHomeTransaction} />
                    </React.Suspense>
                )}
                {activeTab === 'stats' && statsMode === 'ai' && (
                    <React.Suspense fallback={
                        <div className="h-full w-full flex items-center justify-center text-ios-subtext">
                            <Icon name="Loader2" className="w-6 h-6 animate-spin" />
                        </div>
                    }>
                        <AIView
                            onOpenSettings={() => handleTabSelect('settings')}
                            onComposerFocusChange={setHideTabBarForKeyboard}
                        />
                    </React.Suspense>
                )}
                {activeTab === 'ledgers' && <LedgerManageView />}
                {activeTab === 'settings' && <SettingsView />}
            </main>

            {/* Overlays */}
            {/* Overlays */}
            {showSearch && <SearchModal onClose={() => setShowSearch(false)} onEdit={(t) => {
                // Keep search modal open so we return to it after editing
                setInitialAddData(t);
                setInitialAddType(undefined);
                setInitialAddLedgerId(undefined);
                // Also propagate clipboard image if needed? No, usually edit is just existing data.
                setShowAdd(true);
            }} />}
            {showAdd && <AddView onClose={() => { setShowAdd(false); setInitialAddData(undefined); setInitialAddType(undefined); setInitialAddLedgerId(undefined); setClipboardImage(undefined); }} initialTransaction={initialAddData} initialClipboardImage={clipboardImage} initialType={initialAddType} targetLedgerId={initialAddLedgerId} />}
            {showBudget && <BudgetModal onClose={() => setShowBudget(false)} />}
            {(showAddQuickMenu || showStatsQuickMenu) && (
                <button
                    aria-label="关闭快捷菜单"
                    className="fixed inset-0 z-30 cursor-default bg-black/5 backdrop-blur-[1px] animate-fade-in dark:bg-black/20"
                    onClick={() => {
                        suppressStatsClickRef.current = false;
                        setShowAddQuickMenu(false);
                        setShowStatsQuickMenu(false);
                    }}
                />
            )}

            {/* Undo Toast */}
            {showToast && canUndo && (
                <Toast
                    message="已删除，撤回？"
                    onUndo={async () => {
                        try {
                            await undo();
                            feedback.play('undo');
                            setShowToast(false);
                        } catch (e: any) {
                            window.alert('Undo failed: ' + (e?.message || 'unknown error'));
                        }
                    }}
                    onClose={() => setShowToast(false)}
                />
            )}

            {/* Tab Bar - Floating Capsule Design */}
            <nav
                className={clsx(
                    'absolute bottom-6 left-4 right-4 z-40 h-16 transition-all duration-200',
                    hideTabBarForKeyboard && 'pointer-events-none translate-y-24 opacity-0'
                )}
            >
                {showStatsQuickMenu && (
                    <div className="animate-add-quick-menu absolute left-[30%] bottom-[4.75rem] z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/35 p-1 shadow-[0_14px_38px_rgba(0,0,0,0.16)] backdrop-blur-xl dark:bg-zinc-950/30">
                        {[
                            { mode: 'stats' as const, label: '统计', icon: 'BarChart3' },
                            { mode: 'ai' as const, label: 'AI 助手', icon: 'Sparkles' },
                        ].map((action, index) => (
                            <button
                                key={action.mode}
                                onClick={() => selectStatsMode(action.mode)}
                                className={clsx(
                                    'animate-add-quick-action h-11 whitespace-nowrap rounded-full border px-4 text-sm font-semibold shadow-[0_10px_30px_rgba(0,0,0,0.18)] backdrop-blur-md active:scale-95',
                                    statsMode === action.mode
                                        ? 'border-ios-primary/30 bg-ios-primary text-white'
                                        : 'border-white/70 bg-white/95 text-ios-text dark:border-white/10 dark:bg-zinc-900/95'
                                )}
                                style={{ animationDelay: `${index * 45}ms` }}
                            >
                                <span className="flex items-center gap-2">
                                    <Icon
                                        name={action.icon}
                                        className={clsx(
                                            'h-4 w-4',
                                            statsMode === action.mode
                                                ? 'text-white'
                                                : action.mode === 'ai'
                                                    ? 'text-ios-primary'
                                                    : 'text-ios-subtext'
                                        )}
                                    />
                                    {action.label}
                                </span>
                            </button>
                        ))}
                    </div>
                )}
                {showAddQuickMenu && (
                    <div className="animate-add-quick-menu absolute left-1/2 bottom-[4.75rem] z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/35 p-1 shadow-[0_14px_38px_rgba(0,0,0,0.16)] backdrop-blur-xl dark:bg-zinc-950/30">
                        {addQuickActions.map((action, index) => (
                            <button
                                key={action.type}
                                onClick={() => openAdd(action.type)}
                                className="animate-add-quick-action h-11 whitespace-nowrap rounded-full border border-white/70 dark:border-white/10 bg-white/95 dark:bg-zinc-900/95 px-4 text-sm font-semibold text-ios-text shadow-[0_10px_30px_rgba(0,0,0,0.18)] backdrop-blur-md active:scale-95"
                                style={{ animationDelay: `${index * 45}ms` }}
                            >
                                <span className="flex items-center gap-2">
                                    <Icon name={action.icon} className={clsx('h-4 w-4', action.accent)} />
                                    {action.label}
                                </span>
                            </button>
                        ))}
                    </div>
                )}
                {/* Floating Capsule Background */}
                <div className="absolute inset-0 overflow-hidden rounded-full bg-white/60 dark:bg-[#1c1c1e]/60 backdrop-blur-md border border-white/20 dark:border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.12)]">
                    {/* Glossy Reflection Overlay */}
                    <div
                        className="absolute inset-0 pointer-events-none opacity-40 mix-blend-overlay"
                        style={{
                            background: 'linear-gradient(180deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.05) 50%, rgba(255,255,255,0) 100%)'
                        }}
                    />
                </div>

                <div className="flex items-center justify-between h-full px-1.5 relative z-10 text-[10px] font-bold">

                    {/* 1. Home */}
                    <TabButton
                        active={activeTab === 'home'}
                        onClick={() => handleTabSelect('home')}
                        icon="Home"
                        label="首页"
                        position="first"
                    />

                    {/* 2. Stats */}
                    <TabButton
                        active={activeTab === 'stats'}
                        onClick={handleStatsClick}
                        onPointerDown={handleStatsPointerDown}
                        onPointerUp={handleStatsPointerEnd}
                        onPointerLeave={handleStatsPointerEnd}
                        onPointerCancel={handleStatsPointerEnd}
                        onContextMenu={handleStatsContextMenu}
                        ariaExpanded={showStatsQuickMenu}
                        icon={statsMode === 'ai' ? 'Sparkles' : 'BarChart3'}
                        label={statsMode === 'ai' ? 'AI' : '统计'}
                        position="second"
                    />

                    {/* 3. Add (Center Green Button) */}
                    <div className="flex justify-center items-center w-[20%]">
                        <button
                            onClick={handleAddClick}
                            onPointerDown={handleAddPointerDown}
                            onPointerUp={handleAddPointerEnd}
                            onPointerLeave={handleAddPointerEnd}
                            onPointerCancel={handleAddPointerEnd}
                            onContextMenu={handleAddContextMenu}
                            aria-expanded={showAddQuickMenu}
                            aria-label="添加"
                            className={clsx(
                                'w-14 h-10 rounded-[20px] bg-[#34C759] text-white shadow-[0_4px_15px_rgba(52,199,89,0.4)] flex items-center justify-center transform transition-[transform,box-shadow] duration-200 hover:scale-105 active:scale-95 relative overflow-hidden group',
                                showAddQuickMenu && 'scale-105 shadow-[0_8px_24px_rgba(52,199,89,0.5)]'
                            )}
                        >
                            {/* Glass Shine */}
                            <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent pointer-events-none" />
                            <div className="absolute bottom-0 inset-x-0 h-1/2 bg-gradient-to-t from-black/10 to-transparent pointer-events-none" />

                            <Icon
                                name="Plus"
                                className={clsx(
                                    'w-6 h-6 z-10 drop-shadow-sm transition-transform duration-200 ease-out',
                                    showAddQuickMenu && 'rotate-45 scale-105'
                                )}
                                strokeWidth={3}
                            />
                        </button>
                    </div>

                    {/* 4. Ledgers (New) */}
                    <TabButton
                        active={activeTab === 'ledgers'}
                        onClick={() => handleTabSelect('ledgers')}
                        icon="List"
                        label="账本"
                        position="fourth"
                    />

                    {/* 5. Settings */}
                    <TabButton
                        active={activeTab === 'settings'}
                        onClick={() => handleTabSelect('settings')}
                        icon="Settings"
                        label="设置"
                        position="last"
                    />
                </div>
            </nav>
        </div>
    );
};

const TabButton: React.FC<{
    active: boolean;
    onClick: () => void;
    icon: string;
    label: string;
    position?: 'first' | 'second' | 'middle' | 'fourth' | 'last';
    onPointerDown?: React.PointerEventHandler<HTMLButtonElement>;
    onPointerUp?: React.PointerEventHandler<HTMLButtonElement>;
    onPointerLeave?: React.PointerEventHandler<HTMLButtonElement>;
    onPointerCancel?: React.PointerEventHandler<HTMLButtonElement>;
    onContextMenu?: React.MouseEventHandler<HTMLButtonElement>;
    ariaExpanded?: boolean;
}> = ({
    active,
    onClick,
    icon,
    label,
    position = 'middle',
    onPointerDown,
    onPointerUp,
    onPointerLeave,
    onPointerCancel,
    onContextMenu,
    ariaExpanded,
}) => (
    <button
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        onPointerCancel={onPointerCancel}
        onContextMenu={onContextMenu}
        aria-expanded={ariaExpanded}
        onClick={() => {
            if (!active) {
                feedback.play('click');
                feedback.vibrate('light');
            }
            onClick();
        }}
        className="flex flex-col items-center justify-center w-[20%] h-full group relative p-0.5"
    >
        <div className={clsx(
            "relative z-10 flex flex-col items-center justify-center gap-0.5 transition-all duration-300 w-full h-full",
            active ? "bg-gray-200 dark:bg-zinc-700 shadow-sm" : "bg-transparent",
            // Shape & Position Logic for "Outward Pop" effect:
            // Highlighting amplitude is now consistent (1 unit) across all tabs.
            // 1. Home (First): mr-1 pulls background Left
            // 2. Stats (Second): mr-1 pulls background Left
            // 3. Add: Center
            // 4. Ledgers (Third/Fourth): ml-1 pulls background Right
            // 5. Settings (Last): ml-1 pulls background Right
            position === 'first' && active ? "rounded-full mr-1" :
                position === 'second' && active ? "rounded-full mr-1" :
                    position === 'fourth' && active ? "rounded-full ml-1" :
                        position === 'last' && active ? "rounded-full ml-1" :
                            "rounded-full"
        )}>
            <Icon
                name={icon}
                className={clsx(
                    "w-5 h-5 transition-all duration-300",
                    active ? "text-ios-primary fill-current scale-105" : "text-gray-500 dark:text-gray-500"
                )}
                strokeWidth={active ? 2.5 : 2}
            />
            <span className={clsx(
                "text-[10px] font-bold transition-colors duration-200",
                active ? "text-ios-primary" : "text-gray-500 dark:text-gray-500"
            )}>
                {label}
            </span>
        </div>
    </button>
);
