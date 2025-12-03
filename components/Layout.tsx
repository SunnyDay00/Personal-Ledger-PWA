import React, { useState, useEffect } from 'react';
import { HomeView } from './HomeView';
import { StatsView } from './StatsView';
import { SettingsView } from './SettingsView';
import { AddView } from './AddView';
import { OnboardingView } from './OnboardingView';
import { SearchModal } from './SearchModal';
import { BudgetModal } from './BudgetModal';
import { Icon } from './ui/Icon';
import { Toast } from './ui/Toast';
import { useApp } from '../contexts/AppContext';
import { clsx } from 'clsx';
import { feedback } from '../services/feedback';

export const Layout: React.FC = () => {
    const { state, canUndo, undo } = useApp();
    const [activeTab, setActiveTab] = useState<'home' | 'stats' | 'settings'>('home');
    const [showAdd, setShowAdd] = useState(false);
    const [showSearch, setShowSearch] = useState(false);
    const [showBudget, setShowBudget] = useState(false);
    const [showToast, setShowToast] = useState(false);

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

            {/* Main Content Area */}
            {/* Main takes full height, navigation floats on top at bottom */}
            <main className="h-full w-full overflow-hidden relative">
                {activeTab === 'home' && <HomeView onOpenSearch={() => setShowSearch(true)} onOpenBudget={() => setShowBudget(true)} />}
                {activeTab === 'stats' && <StatsView />}
                {activeTab === 'settings' && <SettingsView />}
            </main>

            {/* Overlays */}
            {showAdd && <AddView onClose={() => setShowAdd(false)} />}
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
            <nav className="absolute bottom-0 left-0 right-0 z-40 pb-[env(safe-area-inset-bottom)] bg-white/60 dark:bg-zinc-900/60 backdrop-blur-xl border-t border-black/5 dark:border-white/10 shadow-[0_-1px_10px_rgba(0,0,0,0.02)]">
                <div className="flex items-center justify-around h-16 px-2">

                    <TabButton
                        active={activeTab === 'home'}
                        onClick={() => setActiveTab('home')}
                        icon="Book"
                        label="账本"
                    />

                    <TabButton
                        active={activeTab === 'stats'}
                        onClick={() => setActiveTab('stats')}
                        icon="PieChart"
                        label="统计"
                    />

                    {/* Add Button (Floating Center) */}
                    <div className="relative -top-6">
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

                    <TabButton
                        active={activeTab === 'settings'}
                        onClick={() => setActiveTab('settings')}
                        icon="Settings"
                        label="设置"
                    />

                    {/* Symmetrical Spacer for layout balance */}
                    <div className="w-0"></div>
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
    }} className="flex flex-col items-center justify-center w-20 gap-1 group py-1">
        <Icon
            name={icon}
            className={clsx(
                "w-6 h-6 transition-colors duration-200",
                active ? "text-ios-primary fill-current" : "text-gray-400 dark:text-gray-500"
            )}
            fill={active ? "currentColor" : "none"}
            strokeWidth={active ? 0 : 2}
        />
        <span className={clsx(
            "text-[10px] font-medium transition-colors duration-200",
            active ? "text-ios-primary" : "text-gray-400 dark:text-gray-500"
        )}>
            {label}
        </span>
    </button>
);
