
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useApp } from '../contexts/AppContext';
import { Icon } from './ui/Icon';
import { feedback } from '../services/feedback';
import { TransactionType, Transaction } from '../types';
import { generateId } from '../utils';
import { clsx } from 'clsx';
import { format, addDays, isSameDay } from 'date-fns';
import { Keyboard } from '@capacitor/keyboard';

interface AddViewProps {
    onClose: () => void;
    initialTransaction?: Partial<Transaction>;
}

export const AddView: React.FC<AddViewProps> = ({ onClose, initialTransaction }) => {
    const { state, addTransaction, updateTransaction } = useApp();
    const [type, setType] = useState<TransactionType>('expense');
    const [amountStr, setAmountStr] = useState('0');
    const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
    const [note, setNote] = useState('');
    const [date, setDate] = useState(new Date());
    const [isNoteFocused, setIsNoteFocused] = useState(false);
    const noteInputRef = useRef<HTMLInputElement>(null);

    // KEYBOARD STRATEGY: MANUAL VISUAL VIEWPORT
    // Capacitor config is resize: 'none'. We manually set height.
    const [viewportStyle, setViewportStyle] = useState({
        height: '100dvh', // Default to dynamic viewport height
        top: 0
    });

    useEffect(() => {
        const handleResize = () => {
            const vv = window.visualViewport;
            if (vv) {
                // When keyboard opens, vv.height shrinks.
                // We set our container to exactly match this visible area.
                setViewportStyle({
                    height: `${vv.height}px`,
                    top: vv.offsetTop // Handle any scroll offset
                });

                // Ensure we scroll to show the input if needed
                // But with fixed height, the "Footer" is always at bottom of visible area!
                // So no manual scroll needed for the input bar itself.
            }
        };

        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', handleResize);
            window.visualViewport.addEventListener('scroll', handleResize);
            handleResize(); // Init
        }

        return () => {
            if (window.visualViewport) {
                window.visualViewport.removeEventListener('resize', handleResize);
                window.visualViewport.removeEventListener('scroll', handleResize);
            }
        };
    }, []);

    // Config from settings
    const keypadHeight = state.settings.keypadHeight || 40; // vh
    const cols = state.settings.categoryRows || 5;

    const categories = useMemo(() => state.categories
        .filter(c => c.type === type && c.ledgerId === state.currentLedgerId)
        .sort((a, b) => a.order - b.order), [state.categories, type, state.currentLedgerId]);

    // Init Logic
    useEffect(() => {
        if (initialTransaction) {
            if (initialTransaction.type) setType(initialTransaction.type);
            if (initialTransaction.amount) setAmountStr(initialTransaction.amount.toString());
            if (initialTransaction.categoryId) setSelectedCategoryId(initialTransaction.categoryId);
            if (initialTransaction.note) setNote(initialTransaction.note);
            if (initialTransaction.date) setDate(new Date(initialTransaction.date));
        }
        if (categories.length > 0) {
            const isValid = selectedCategoryId && categories.some(c => c.id === selectedCategoryId);
            if (!isValid && !initialTransaction?.categoryId) setSelectedCategoryId(categories[0].id);
        } else if (selectedCategoryId !== null) {
            setSelectedCategoryId(null);
        }
    }, [type, categories, initialTransaction]);

    const quickNotes = useMemo(() => {
        if (!selectedCategoryId) return [];
        return state.settings.categoryNotes?.[selectedCategoryId] || [];
    }, [selectedCategoryId, state.settings.categoryNotes]);

    const handleKeyPress = (key: string) => {
        if (key === 'backspace') {
            feedback.play('delete');
            feedback.vibrate('light');
            setAmountStr(prev => prev.length > 1 ? prev.slice(0, -1) : '0');
        } else if (key === '.') {
            feedback.play('click');
            feedback.vibrate('light');
            if (!amountStr.includes('.')) setAmountStr(prev => prev + '.');
        } else {
            feedback.play('click');
            feedback.vibrate('light');
            const parts = amountStr.split('.');
            if (parts[1] && parts[1].length >= 2) return;
            setAmountStr(prev => prev === '0' ? key : prev + key);
        }
    };

    const handleSubmit = () => {
        const amount = parseFloat(amountStr);
        if (amount <= 0 || !selectedCategoryId) return;

        if (initialTransaction && initialTransaction.id) {
            updateTransaction({
                ...initialTransaction,
                id: initialTransaction.id,
                ledgerId: initialTransaction.ledgerId || state.currentLedgerId,
                updatedAt: Date.now(),
                amount, type, categoryId: selectedCategoryId, date: date.getTime(), note
            } as Transaction);
        } else {
            addTransaction({
                id: generateId(),
                ledgerId: state.currentLedgerId,
                amount, type, categoryId: selectedCategoryId, date: date.getTime(), note,
                createdAt: Date.now(),
            });
        }
        setAmountStr('0');
        setNote('');
        feedback.play('success');
        feedback.vibrate('success');
        onClose();
    };

    const displayAmount = useMemo(() => {
        const parts = amountStr.split('.');
        const intPart = parseInt(parts[0] || '0').toLocaleString('en-US');
        return parts.length > 1 ? `${intPart}.${parts[1]}` : intPart;
    }, [amountStr]);

    return (
        // KEY CHANGE: Fixed positioning with explicit height/top from visualViewport
        <div
            className={clsx("fixed left-0 w-full flex flex-col bg-ios-bg overflow-hidden z-50", state.settings.enableAnimations && "animate-slide-up")}
            style={{
                top: viewportStyle.top,
                height: viewportStyle.height
            }}
        >

            {/* 1. Header (Fixed) */}
            <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2 bg-ios-bg z-10 shrink-0">
                <button onClick={onClose} className="p-2 -ml-2 text-ios-subtext">取消</button>
                <div className="flex bg-gray-200 dark:bg-zinc-800 rounded-lg p-0.5">
                    <button onClick={() => setType('expense')} className={`px-6 py-1.5 rounded-md text-sm font-medium transition-all ${type === 'expense' ? 'bg-white dark:bg-zinc-700 shadow-sm text-ios-text' : 'text-ios-subtext'}`}>支出</button>
                    <button onClick={() => setType('income')} className={`px-6 py-1.5 rounded-md text-sm font-medium transition-all ${type === 'income' ? 'bg-white dark:bg-zinc-700 shadow-sm text-ios-text' : 'text-ios-subtext'}`}>收入</button>
                </div>
                <div className="w-10"></div>
            </div>

            {/* 2. Content Area (Flex Grow + min-h-0) 
                CRITICAL: min-h-0 allows this area to shrink below its content size when the keyboard (and Footer) pushes up.
            */}
            <div className="flex-1 overflow-y-auto no-scrollbar relative min-h-0" onClick={() => { if (isNoteFocused) setIsNoteFocused(false); }}>
                <div className="grid gap-y-6 p-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                    {categories.map(cat => (
                        <button key={cat.id} onClick={() => { setSelectedCategoryId(cat.id); feedback.play('click'); feedback.vibrate('light'); }} className="flex flex-col items-center gap-2 group">
                            <div className={clsx("w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200", selectedCategoryId === cat.id ? "bg-ios-primary text-white shadow-lg shadow-blue-500/30 scale-110" : "bg-gray-100 dark:bg-zinc-800 text-ios-subtext group-active:scale-95")}>
                                <Icon name={cat.icon} className="w-5 h-5" />
                            </div>
                            <span className={clsx("text-[10px] transition-colors truncate w-full text-center", selectedCategoryId === cat.id ? "text-ios-primary font-medium" : "text-ios-subtext")}>{cat.name}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* 3. Footer (Input + Keypad) 
                By being the last child in a Flex Column container with Fixed Height,
                this Footer will always be visible at the bottom.
            */}
            <div className={clsx(
                "bg-white dark:bg-zinc-900 rounded-t-3xl shadow-[0_-5px_20px_rgba(0,0,0,0.1)] border-t border-white/10 transition-transform duration-300 shrink-0",
            )}>
                {/* Note Input Row */}
                <div className="px-5 py-3 border-b border-ios-border flex items-center gap-4 relative z-20">
                    <div className="flex items-center gap-2 bg-gray-100 dark:bg-zinc-800 px-3 py-1.5 rounded-xl flex-1">
                        <Icon name="Edit3" className="w-4 h-4 text-ios-subtext" />
                        <input
                            ref={noteInputRef}
                            type="text"
                            placeholder="添加备注..."
                            value={note}
                            onFocus={() => setIsNoteFocused(true)}
                            onBlur={() => setIsNoteFocused(false)}
                            onChange={(e) => setNote(e.target.value)}
                            // Ensure fast tap
                            className="bg-transparent text-sm placeholder:text-ios-subtext focus:outline-none flex-1 text-ios-text"
                        />
                    </div>
                    <div className="text-3xl font-bold tracking-tight text-ios-text min-w-[30%] text-right tabular-nums">
                        {displayAmount}
                    </div>
                </div>

                {/* Quick Notes */}
                {(isNoteFocused || quickNotes.length > 0) && (
                    <div className="flex gap-2 overflow-x-auto no-scrollbar px-5 py-2 border-b border-ios-border bg-gray-50/50 dark:bg-zinc-900/50">
                        {quickNotes.map((n, idx) => (
                            <button key={idx} onClick={() => setNote(n)} className="flex-shrink-0 px-3 py-1 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-full text-xs text-ios-subtext active:bg-ios-primary active:text-white transition-colors">{n}</button>
                        ))}
                    </div>
                )}

                {/* Keypad */}
                <div className={clsx("transition-all duration-300 overflow-hidden", isNoteFocused ? "h-0 opacity-0" : "opacity-100")}
                    style={{ height: isNoteFocused ? 0 : `${keypadHeight}vh`, minHeight: isNoteFocused ? 0 : '250px' }}>

                    <div className="flex items-center justify-between px-4 py-2 bg-gray-50/50 dark:bg-zinc-900/50 text-xs text-ios-subtext border-b border-ios-border">
                        <div className="flex gap-2">
                            {[-1, 0, 1].map(offset => {
                                const d = addDays(new Date(), offset);
                                return <button key={offset} onClick={() => setDate(d)} className={clsx("px-3 py-0.5 rounded-full", isSameDay(date, d) ? "bg-ios-primary text-white" : "bg-gray-200 dark:bg-zinc-800")}>{offset === 0 ? '今天' : offset === -1 ? '昨天' : '明天'}</button>
                            })}
                        </div>
                        <span>{format(date, 'yyyy/MM/dd')}</span>
                    </div>

                    <div className="grid grid-cols-4 grid-rows-4 h-full bg-gray-200 dark:bg-zinc-800 gap-[0.5px] pb-[env(safe-area-inset-bottom)]">
                        {['1', '2', '3'].map(k => <Key key={k} label={k} onClick={() => handleKeyPress(k)} />)}
                        <div className="relative w-full h-full">
                            <Key label="日期" icon="Calendar" onClick={() => { }} className="bg-gray-100 dark:bg-zinc-700 !text-sm w-full h-full relative z-10 pointer-events-none" />
                            <input type="date" className="absolute inset-0 w-full h-full opacity-0 z-20 cursor-pointer" onChange={(e) => { if (e.target.valueAsDate) setDate(e.target.valueAsDate); }} />
                        </div>
                        {['4', '5', '6'].map(k => <Key key={k} label={k} onClick={() => handleKeyPress(k)} />)}
                        <Key label="Del" icon="Delete" onClick={() => handleKeyPress('backspace')} className="row-span-2 bg-red-100 dark:bg-red-900/30 text-red-600 active:bg-red-200" />
                        {['7', '8', '9'].map(k => <Key key={k} label={k} onClick={() => handleKeyPress(k)} />)}
                        <Key label="." onClick={() => handleKeyPress('.')} />
                        <Key label="0" onClick={() => handleKeyPress('0')} />
                        <button onClick={handleSubmit} className="col-span-2 bg-ios-primary text-white text-lg font-medium active:bg-blue-600 transition-colors">{initialTransaction ? '保存' : '完成'}</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const Key: React.FC<{ label: string; icon?: string; onClick: () => void; className?: string }> = ({ label, icon, onClick, className }) => (
    <button onClick={onClick} className={clsx("bg-white dark:bg-zinc-900 active:bg-gray-100 dark:active:bg-zinc-700 flex items-center justify-center text-2xl font-light transition-colors", className)}>
        {icon ? <Icon name={icon} className="w-6 h-6" /> : label}
    </button>
);