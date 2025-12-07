import React, { useState, useEffect } from 'react';
import { HomeView } from './HomeView';
import { StatsView } from './StatsView';
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
import { Transaction } from '../types';
import { LiquidFilter } from './LiquidFilter';

export const Layout: React.FC = () => {
    const { state, canUndo, undo } = useApp();
    const [activeTab, setActiveTab] = useState<'home' | 'stats' | 'ledgers' | 'settings'>('home');
    const [showAdd, setShowAdd] = useState(false);
    const [showSearch, setShowSearch] = useState(false);
    const [showBudget, setShowBudget] = useState(false);
    const [showToast, setShowToast] = useState(false);
    const [initialAddData, setInitialAddData] = useState<Partial<Transaction> | undefined>(undefined);

    // Handle Deep Links (URL Scheme)
    useEffect(() => {
        App.addListener('appUrlOpen', (event: URLOpenListenerEvent) => {
            try {
                // Example: personalledger://add?amount=100&note=Lunch&type=expense&category=Food
                const urlStr = event.url;
                if (!urlStr.includes('add')) return;

                const url = new URL(urlStr);
                const params = url.searchParams;

                const amount = parseFloat(params.get('amount') || '0');
                const note = params.get('note') ? decodeURIComponent(params.get('note')!) : '';
                const typeParam = params.get('type');
                const type = (typeParam === 'income' || typeParam === 'expense') ? typeParam : 'expense';

                const categoryName = params.get('category') ? decodeURIComponent(params.get('category')!) : null;
                const ledgerName = params.get('ledger') ? decodeURIComponent(params.get('ledger')!) : null;

                let categoryId: string | undefined;
                let ledgerId: string | undefined;

                // Find Ledger
                if (ledgerName) {
                    const ledger = state.ledgers.find(l => l.name === ledgerName);
                    if (ledger) ledgerId = ledger.id;
                }

                // Find Category (in target ledger or current)
                const targetLedgerId = ledgerId || state.currentLedgerId;
                if (categoryName) {
                    const category = state.categories.find(c =>
                        c.name === categoryName &&
                        c.ledgerId === targetLedgerId &&
                        c.type === type
                    );
                    if (category) categoryId = category.id;
                }

                setInitialAddData({
                    amount: amount > 0 ? amount : undefined,
                    note: note || undefined,
                    type,
                    categoryId,
                    ledgerId,
                    date: Date.now() // Default to now
                });

                setShowAdd(true);
                feedback.play('success');
            } catch (e) {
                console.error('Error parsing URL:', e);
            }
        });
    }, [state.ledgers, state.categories, state.currentLedgerId]);

    // Show toast when canUndo becomes true
    useEffect(() => {
        if (canUndo) {
            setShowToast(true);
        }
    }, [canUndo]);

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

    if (state.settings.isFirstRun) {
        return <OnboardingView />;
    }

    return (
        <div className="h-full w-full flex flex-col bg-ios-bg text-ios-text overflow-hidden font-sans">
            <LiquidFilter />

            {/* Main Content Area */}
            {/* Main takes full height, navigation floats on top at bottom */}
            <main className="h-full w-full overflow-hidden relative">
                {activeTab === 'home' && <HomeView onOpenSearch={() => setShowSearch(true)} onOpenBudget={() => setShowBudget(true)} />}
                {activeTab === 'stats' && <StatsView />}
                {activeTab === 'ledgers' && <LedgerManageView />}
                {activeTab === 'settings' && <SettingsView />}
            </main>

            {/* Overlays */}
            {showAdd && <AddView onClose={() => { setShowAdd(false); setInitialAddData(undefined); }} initialTransaction={initialAddData} />}
            {showSearch && <SearchModal onClose={() => setShowSearch(false)} />}
            {showBudget && <BudgetModal onClose={() => setShowBudget(false)} />}

            {/* Undo Toast */}
            {showToast && canUndo && (
                <Toast
                    message="已删除，撤回？"
                    onUndo={() => {
                        feedback.play('undo');
                        undo();
                        setShowToast(false);
                    }}
                    onClose={() => setShowToast(false)}
                />
            )}

            {/* Tab Bar - Absolute Positioning for Glass Effect overlaying content */}
            <nav
                className="absolute bottom-0 left-0 right-0 z-40 pb-[env(safe-area-inset-bottom)]"
            >
                {/* Background Layer (Clipped) */}
                <div className="absolute inset-0 overflow-hidden bg-white/60 dark:bg-zinc-900/60 backdrop-blur-3xl backdrop-saturate-150 border-t border-white/20 dark:border-white/10 shadow-[0_-1px_10px_rgba(0,0,0,0.02)]">
                    {/* Texture Overlay */}
                    <div
                        className="absolute inset-0 pointer-events-none opacity-30 mix-blend-overlay"
                        style={{
                            background: 'linear-gradient(180deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 100%)',
                            filter: 'url(#liquid-glass)',
                            zIndex: -1
                        }}
                    />
                </div>

                <div className="flex items-center justify-between h-16 px-2 relative z-10 text-[10px]">

                    {/* 1. Home */}
                    <TabButton
                        active={activeTab === 'home'}
                        onClick={() => setActiveTab('home')}
                        icon="Home"
                        label="首页"
                    />

                    {/* 2. Stats */}
                    <TabButton
                        active={activeTab === 'stats'}
                        onClick={() => setActiveTab('stats')}
                        icon="BarChart3"
                        label="统计"
                    />

                    {/* 3. Add (Floating Center) */}
                    <div className="relative -top-6 w-[20%] flex justify-center">
                        <button
                            onClick={() => {
                                feedback.play('success');
                                feedback.vibrate('light');
                                setShowAdd(true);
                            }}
                            className="w-16 h-16 rounded-full bg-ios-primary text-white shadow-lg shadow-blue-500/30 flex items-center justify-center transform transition-transform active:scale-95 border-4 border-ios-bg"
                        >
                            <Icon name="Plus" className="w-8 h-8" />
                        </button>
                    </div>

                    {/* 4. Ledgers (New) */}
                    <TabButton
                        active={activeTab === 'ledgers'}
                        onClick={() => setActiveTab('ledgers')}
                        icon="List"
                        label="账本"
                    />

                    {/* 5. Settings */}
                    <TabButton
                        active={activeTab === 'settings'}
                        onClick={() => setActiveTab('settings')}
                        icon="Settings"
                        label="设置"
                    />
                </div>
            </nav>
        </div>
    );
};

const TabButton: React.FC<{ active: boolean; onClick: () => void; icon: string; label: string }> = ({ active, onClick, icon, label }) => (
    <button onClick={() => {
        if (!active) {
            feedback.play('click');
            feedback.vibrate('light');
        }
        onClick();
    }} className="flex flex-col items-center justify-center w-[20%] h-full group relative">
        {/* Active Pill Indicator */}
        {active && (
            <div className="absolute inset-x-1 inset-y-0 bg-ios-primary/10 dark:bg-ios-primary/20 rounded-2xl shadow-[0_0_15px_rgba(0,122,255,0.3)] border border-ios-primary/10 dark:border-ios-primary/20 animate-fade-in">
                <div className="absolute inset-0 rounded-2xl border-t border-white/40 dark:border-white/20" />
            </div>
        )}

        <div className="relative z-10 flex flex-col items-center gap-1">
            <Icon
                name={icon}
                className={clsx(
                    "w-6 h-6 transition-all duration-300",
                    active ? "text-ios-primary scale-110 drop-shadow-sm" : "text-gray-400 dark:text-gray-500"
                )}
                strokeWidth={active ? 2.5 : 2}
            />
            <span className={clsx(
                "text-[10px] font-medium transition-colors duration-200",
                active ? "text-ios-primary" : "text-gray-400 dark:text-gray-500"
            )}>
                {label}
            </span>
        </div>
    </button>
);
