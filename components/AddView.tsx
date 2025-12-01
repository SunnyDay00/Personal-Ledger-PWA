import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useApp } from '../contexts/AppContext';
import { Icon } from './ui/Icon';
import { TransactionType, Transaction } from '../types';
import { generateId } from '../utils';
import { clsx } from 'clsx';
import { format, addDays, isSameDay } from 'date-fns';

interface AddViewProps {
    onClose: () => void;
    initialTransaction?: Transaction;
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

    // Viewport management for iOS keyboard
    const [visualViewport, setVisualViewport] = useState({
        height: typeof window !== 'undefined' ? window.innerHeight : 800,
        offsetTop: 0
    });

    useEffect(() => {
        const handleResize = () => {
            // Type assertion to bypass TS error if VisualViewport type is missing
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
            handleResize(); // Init
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

    // Config from settings
    const keypadHeight = state.settings.keypadHeight || 40; // vh
    const cols = state.settings.categoryRows || 5;

    // Memoize categories
    const categories = useMemo(() => state.categories
        .filter(c => c.type === type && c.ledgerId === state.currentLedgerId)
        .sort((a, b) => a.order - b.order), [state.categories, type, state.currentLedgerId]);

    // Init for Edit Mode & Smart Selection
    useEffect(() => {
        if (initialTransaction) {
            setType(initialTransaction.type);
            setAmountStr(initialTransaction.amount.toString());
            setSelectedCategoryId(initialTransaction.categoryId);
            setNote(initialTransaction.note);
            setDate(new Date(initialTransaction.date));
        }

        if (categories.length > 0) {
            const isValid = selectedCategoryId && categories.some(c => c.id === selectedCategoryId);
            if (!isValid && !initialTransaction) {
                setSelectedCategoryId(categories[0].id);
            }
        } else {
            if (selectedCategoryId !== null) setSelectedCategoryId(null);
        }
    }, [type, categories, initialTransaction]);

    // Get Recent Notes for current Category
    const quickNotes = useMemo(() => {
        if (!selectedCategoryId) return [];
        return state.settings.categoryNotes?.[selectedCategoryId] || [];
    }, [selectedCategoryId, state.settings.categoryNotes]);

    const handleKeyPress = (key: string) => {
        if (key === 'backspace') {
            setAmountStr(prev => prev.length > 1 ? prev.slice(0, -1) : '0');
        } else if (key === '.') {
            if (!amountStr.includes('.')) setAmountStr(prev => prev + '.');
        } else {
            const parts = amountStr.split('.');
            if (parts[1] && parts[1].length >= 2) return; // Limit to 2 decimals
            setAmountStr(prev => prev === '0' ? key : prev + key);
        }
    };

    const handleSubmit = () => {
        const amount = parseFloat(amountStr);
        if (amount <= 0 || !selectedCategoryId) return;

        if (initialTransaction) {
            updateTransaction({
                ...initialTransaction,
                amount,
                type,
                categoryId: selectedCategoryId,
                date: date.getTime(),
                note,
                updatedAt: Date.now()
            });
        } else {
            addTransaction({
                id: generateId(),
                ledgerId: state.currentLedgerId,
                amount,
                type,
                categoryId: selectedCategoryId,
                date: date.getTime(),
                note,
                createdAt: Date.now(),
            });
        }

        setAmountStr('0');
        setNote('');
        onClose();
    };

    const displayAmount = useMemo(() => {
        const parts = amountStr.split('.');
        const intPart = parseInt(parts[0] || '0').toLocaleString('en-US');
        if (parts.length > 1) {
            return `${intPart}.${parts[1]}`;
        }
        return intPart;
    }, [amountStr]);

    return (
        <div
            className={clsx("fixed left-0 z-50 flex flex-col bg-ios-bg w-full", state.settings.enableAnimations && "animate-slide-up")}
            style={{
                height: visualViewport.height,
                top: visualViewport.offsetTop
            }}
        >
            {/* Top Bar */}
            <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2 bg-ios-bg z-10 shrink-0">
                <button onClick={onClose} className="p-2 -ml-2 text-ios-subtext">取消</button>
                <div className="flex bg-gray-200 dark:bg-zinc-800 rounded-lg p-0.5">
                    <button
                        onClick={() => setType('expense')}
                        className={`px-6 py-1.5 rounded-md text-sm font-medium transition-all ${type === 'expense' ? 'bg-white dark:bg-zinc-700 shadow-sm text-ios-text' : 'text-ios-subtext'}`}
                    >支出</button>
                    <button
                        onClick={() => setType('income')}
                        className={`px-6 py-1.5 rounded-md text-sm font-medium transition-all ${type === 'income' ? 'bg-white dark:bg-zinc-700 shadow-sm text-ios-text' : 'text-ios-subtext'}`}
                    >收入</button>
                </div>
                <div className="w-10"></div>
            </div>

            {/* Category Area */}
            <div className="flex-1 overflow-y-auto no-scrollbar relative" onClick={() => { if (isNoteFocused) setIsNoteFocused(false); }}>
                <div className="grid gap-y-6 p-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                    {categories.map(cat => (
                        <button
                            key={cat.id}
                            onClick={() => setSelectedCategoryId(cat.id)}
                            className="flex flex-col items-center gap-2 group"
                        >
                            <div className={clsx(
                                "w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200",
                                selectedCategoryId === cat.id
                                    ? "bg-ios-primary text-white shadow-lg shadow-blue-500/30 scale-110"
                                    : "bg-gray-100 dark:bg-zinc-800 text-ios-subtext group-active:scale-95"
                            )}>
                                <Icon name={cat.icon} className="w-5 h-5" />
                            </div>
                            <span className={clsx(
                                "text-[10px] transition-colors truncate w-full text-center",
                                selectedCategoryId === cat.id ? "text-ios-primary font-medium" : "text-ios-subtext"
                            )}>{cat.name}</span>
                        </button>
                    ))}
                    {categories.length === 0 && (
                        <div className="col-span-full text-center py-10 text-ios-subtext text-sm">
                            暂无分类，请去设置添加
                        </div>
                    )}
                </div>
            </div>

            {/* Input Area */}
            <div className={clsx(
                "bg-white dark:bg-zinc-900 rounded-t-3xl shadow-[0_-5px_20px_rgba(0,0,0,0.1)] border-t border-white/10 transition-transform duration-300 shrink-0",
                isNoteFocused ? "translate-y-0" : ""
            )}>

                {/* Note & Amount */}
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
                            className="bg-transparent text-sm placeholder:text-ios-subtext focus:outline-none flex-1 text-ios-text"
                        />
                    </div>
                    <div className="text-3xl font-bold tracking-tight text-ios-text min-w-[30%] text-right tabular-nums">
                        {displayAmount}
                    </div>
                </div>

                {/* Quick Notes Chips */}
                {(isNoteFocused || quickNotes.length > 0) && (
                    <div className="flex gap-2 overflow-x-auto no-scrollbar px-5 py-2 border-b border-ios-border bg-gray-50/50 dark:bg-zinc-900/50">
                        {quickNotes.map((n, idx) => (
                            <button
                                key={idx}
                                onClick={() => setNote(n)}
                                className="flex-shrink-0 px-3 py-1 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-full text-xs text-ios-subtext active:bg-ios-primary active:text-white transition-colors"
                            >
                                {n}
                            </button>
                        ))}
                        {quickNotes.length === 0 && <span className="text-[10px] text-ios-subtext">暂无历史备注</span>}
                    </div>
                )}

                {/* Keypad Container */}
                <div className={clsx(
                    "transition-all duration-300 overflow-hidden",
                    isNoteFocused ? "h-0 opacity-0" : "opacity-100"
                )} style={{ height: isNoteFocused ? 0 : `${keypadHeight}vh`, minHeight: isNoteFocused ? 0 : '250px' }}>

                    {/* Quick Date */}
                    <div className="flex items-center justify-between px-4 py-2 bg-gray-50/50 dark:bg-zinc-900/50 text-xs text-ios-subtext border-b border-ios-border">
                        <div className="flex gap-2">
                            {[-1, 0, 1].map(offset => {
                                const d = addDays(new Date(), offset);
                                return (
                                    <button key={offset} onClick={() => setDate(d)} className={clsx("px-3 py-0.5 rounded-full", isSameDay(date, d) ? "bg-ios-primary text-white" : "bg-gray-200 dark:bg-zinc-800")}>
                                        {offset === 0 ? '今天' : offset === -1 ? '昨天' : '明天'}
                                    </button>
                                );
                            })}
                        </div>
                        <span>{format(date, 'yyyy/MM/dd')}</span>
                    </div>

                    {/* Grid Keypad */}
                    <div className="grid grid-cols-4 grid-rows-4 h-full bg-gray-200 dark:bg-zinc-800 gap-[0.5px] pb-[env(safe-area-inset-bottom)]">
                        {/* Row 1 */}
                        <Key label="1" onClick={() => handleKeyPress('1')} />
                        <Key label="2" onClick={() => handleKeyPress('2')} />
                        <Key label="3" onClick={() => handleKeyPress('3')} />

                        {/* Date Picker Button - Fixed for iOS */}
                        <div className="relative w-full h-full">
                            {/* Visual Button */}
                            <Key
                                label="日期"
                                icon="Calendar"
                                onClick={() => { }} // No-op, click is handled by input
                                className="bg-gray-100 dark:bg-zinc-700 !text-sm w-full h-full relative z-10 pointer-events-none"
                            />
                            {/* Transparent Input overlay */}
                            <input
                                type="date"
                                className="absolute inset-0 w-full h-full opacity-0 z-20 cursor-pointer appearance-none"
                                onChange={(e) => {
                                    if (e.target.valueAsDate) setDate(e.target.valueAsDate);
                                }}
                            />
                        </div>

                        {/* Row 2 */}
                        <Key label="4" onClick={() => handleKeyPress('4')} />
                        <Key label="5" onClick={() => handleKeyPress('5')} />
                        <Key label="6" onClick={() => handleKeyPress('6')} />
                        {/* Delete Spans 2 Rows */}
                        <Key label="Del" icon="Delete" onClick={() => handleKeyPress('backspace')} className="row-span-2 bg-red-100 dark:bg-red-900/30 text-red-600 active:bg-red-200" />

                        {/* Row 3 */}
                        <Key label="7" onClick={() => handleKeyPress('7')} />
                        <Key label="8" onClick={() => handleKeyPress('8')} />
                        <Key label="9" onClick={() => handleKeyPress('9')} />
                        {/* (Col 4 taken by Del) */}

                        {/* Row 4 */}
                        <Key label="." onClick={() => handleKeyPress('.')} />
                        <Key label="0" onClick={() => handleKeyPress('0')} />
                        {/* Done Spans 2 Cols */}
                        <button onClick={handleSubmit} className="col-span-2 bg-ios-primary text-white text-lg font-medium active:bg-blue-600 transition-colors">
                            {initialTransaction ? '保存' : '完成'}
                        </button>
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