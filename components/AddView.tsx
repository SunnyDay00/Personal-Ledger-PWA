import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useApp } from '../contexts/AppContext';
import { Icon } from './ui/Icon';
import { feedback } from '../services/feedback';
import { TransactionType, Transaction } from '../types';
import { generateId } from '../utils';
import { clsx } from 'clsx';
import { format, addDays, isSameDay } from 'date-fns';
import { Keyboard } from '@capacitor/keyboard';
import { imageService } from '../services/imageService';
import { ImagePreview } from './ImagePreview';

interface AddViewProps {
    onClose: () => void;
    initialTransaction?: Partial<Transaction>;
    initialClipboardImage?: string;
}

interface AttachmentItem {
    id: string;
    type: 'key' | 'blob';
    val: string | Blob;
    url: string;
}

type Operator = '+' | '-' | '*' | '/';

const LONG_PRESS_MS = 450;
const OPERATORS = new Set<Operator>(['+', '-', '*', '/']);

const isOperatorChar = (char?: string): char is Operator => {
    return !!char && OPERATORS.has(char as Operator);
};

const getLastNumberSegment = (value: string) => {
    const segments = value.split(/[+\-*/]/);
    return segments[segments.length - 1] || '';
};

const appendDigitToExpression = (value: string, digit: string) => {
    if (value === '0') return digit;

    const lastSegment = getLastNumberSegment(value);
    if (lastSegment === '0' && !lastSegment.includes('.')) {
        return value.slice(0, -1) + digit;
    }

    return value + digit;
};

const appendDecimalToExpression = (value: string) => {
    const lastSegment = getLastNumberSegment(value);
    if (lastSegment.includes('.')) return value;
    if (isOperatorChar(value.slice(-1))) return `${value}0.`;
    return `${value}.`;
};

const appendOperatorToExpression = (value: string, operator: Operator) => {
    if (!value || value === '0') return value;
    if (isOperatorChar(value.slice(-1))) {
        return `${value.slice(0, -1)}${operator}`;
    }
    return `${value}${operator}`;
};

const deleteFromExpression = (value: string) => {
    if (value.length <= 1) return '0';
    return value.slice(0, -1);
};

const formatResultNumber = (value: number) => {
    const normalized = Math.round((value + Number.EPSILON) * 100) / 100;
    return normalized.toLocaleString('en-US', {
        minimumFractionDigits: Number.isInteger(normalized) ? 0 : 2,
        maximumFractionDigits: 2,
    });
};

const formatExpressionForDisplay = (value: string) => {
    if (/[+\-*/]/.test(value)) {
        return value.replace(/\*/g, '×').replace(/\//g, '÷');
    }

    const [rawInt, rawDecimal] = value.split('.');
    const formattedInt = Number(rawInt || '0').toLocaleString('en-US');

    if (value.endsWith('.') && rawDecimal === '') {
        return `${formattedInt}.`;
    }

    return rawDecimal !== undefined ? `${formattedInt}.${rawDecimal}` : formattedInt;
};

const evaluateAmountExpression = (value: string) => {
    const normalized = value.replace(/\s+/g, '');
    const validPattern = /^\d+(?:\.\d+)?(?:[+\-*/]\d+(?:\.\d+)?)*$/;
    if (!validPattern.test(normalized)) {
        throw new Error('请输入有效金额');
    }

    const tokens = normalized.match(/\d+(?:\.\d+)?|[+\-*/]/g);
    if (!tokens || tokens.join('') !== normalized) {
        throw new Error('请输入有效金额');
    }

    const values: number[] = [];
    const operators: Operator[] = [];

    for (const token of tokens) {
        if (isOperatorChar(token)) {
            operators.push(token);
            continue;
        }

        const currentValue = Number(token);
        if (Number.isNaN(currentValue)) {
            throw new Error('请输入有效金额');
        }

        const lastOperator = operators[operators.length - 1];
        if (lastOperator === '*' || lastOperator === '/') {
            operators.pop();
            const left = values.pop();
            if (left === undefined) throw new Error('请输入有效金额');
            if (lastOperator === '/' && currentValue === 0) {
                throw new Error('除数不能为 0');
            }
            values.push(lastOperator === '*' ? left * currentValue : left / currentValue);
        } else {
            values.push(currentValue);
        }
    }

    let result = values[0];
    if (result === undefined) throw new Error('请输入有效金额');

    for (let i = 0, valueIndex = 1; i < operators.length; i += 1, valueIndex += 1) {
        const operator = operators[i];
        const nextValue = values[valueIndex];
        if (nextValue === undefined) throw new Error('请输入有效金额');
        result = operator === '+' ? result + nextValue : result - nextValue;
    }

    if (!Number.isFinite(result)) {
        throw new Error('请输入有效金额');
    }

    return Math.round((result + Number.EPSILON) * 100) / 100;
};

const parseDateInputValue = (value: string) => {
    if (!value) return null;
    const parsed = new Date(`${value}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const AddView: React.FC<AddViewProps> = ({ onClose, initialTransaction, initialClipboardImage }) => {
    const { state, addTransaction, updateTransaction } = useApp();
    const [type, setType] = useState<TransactionType>('expense');
    const [amountStr, setAmountStr] = useState('0');
    const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
    const [note, setNote] = useState('');
    const [date, setDate] = useState(new Date());
    const [isNoteFocused, setIsNoteFocused] = useState(false);
    const noteInputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [keyboardHeight, setKeyboardHeight] = useState(0);

    useEffect(() => {
        let showListener: any;
        let hideListener: any;

        const setupListeners = async () => {
            showListener = await Keyboard.addListener('keyboardWillShow', info => {
                if (info.keyboardHeight > 0) {
                    setKeyboardHeight(info.keyboardHeight);
                    window.scrollTo(0, 0);
                }
            });

            hideListener = await Keyboard.addListener('keyboardWillHide', () => {
                setKeyboardHeight(0);
                window.scrollTo(0, 0);
            });
        };

        setupListeners();

        return () => {
            if (showListener) showListener.remove();
            if (hideListener) hideListener.remove();
        };
    }, []);

    const keypadHeight = state.settings.keypadHeight || 40;
    const cols = state.settings.categoryRows || 5;

    const categories = useMemo(() => state.categories
        .filter(c => c.type === type && c.ledgerId === state.currentLedgerId)
        .sort((a, b) => a.order - b.order), [state.categories, type, state.currentLedgerId]);

    useEffect(() => {
        let cancelled = false;

        const loadInitialAttachments = async () => {
            if (!initialTransaction?.attachments || initialTransaction.attachments.length === 0) {
                setAttachments([]);
                return;
            }

            const items: AttachmentItem[] = [];
            for (const key of initialTransaction.attachments) {
                try {
                    const blob = await imageService.fetchImageBlob(key);
                    const url = URL.createObjectURL(blob);
                    items.push({ id: key, type: 'key', val: key, url });
                } catch (error) {
                    console.warn('Failed to load image', key, error);
                }
            }

            if (!cancelled) {
                setAttachments(items);
            } else {
                items.forEach(item => URL.revokeObjectURL(item.url));
            }
        };

        if (initialTransaction) {
            setType(initialTransaction.type || 'expense');
            setAmountStr(initialTransaction.amount !== undefined ? initialTransaction.amount.toString() : '0');
            setSelectedCategoryId(initialTransaction.categoryId || null);
            setNote(initialTransaction.note || '');
            setDate(initialTransaction.date ? new Date(initialTransaction.date) : new Date());
            void loadInitialAttachments();
        } else {
            setType('expense');
            setAmountStr('0');
            setSelectedCategoryId(null);
            setNote('');
            setDate(new Date());
            setAttachments([]);
        }

        return () => {
            cancelled = true;
        };
    }, [initialTransaction]);

    useEffect(() => {
        if (categories.length === 0) {
            setSelectedCategoryId(null);
            return;
        }

        const stillValid = selectedCategoryId && categories.some(c => c.id === selectedCategoryId);
        if (!stillValid) {
            setSelectedCategoryId(categories[0].id);
        }
    }, [categories, selectedCategoryId]);

    useEffect(() => {
        if (!initialClipboardImage) return;

        const processClipboard = async () => {
            try {
                setIsUploading(true);
                const base64 = initialClipboardImage.startsWith('data:')
                    ? initialClipboardImage
                    : `data:image/png;base64,${initialClipboardImage}`;
                const response = await fetch(base64);
                const blob = await response.blob();
                const file = new File([blob], `clipboard_${Date.now()}.png`, { type: blob.type || 'image/png' });
                const key = await imageService.uploadImage(file);
                const url = URL.createObjectURL(blob);
                setAttachments(prev => [...prev, { id: key, type: 'key', val: key, url }]);
                feedback.play('success');
            } catch (error) {
                console.error('Clipboard paste failed', error);
                feedback.play('error');
            } finally {
                setIsUploading(false);
            }
        };

        void processClipboard();
    }, [initialClipboardImage]);

    const quickNotes = useMemo(() => {
        if (!selectedCategoryId) return [];
        return state.settings.categoryNotes?.[selectedCategoryId] || [];
    }, [selectedCategoryId, state.settings.categoryNotes]);

    useEffect(() => {
        const handlePaste = (event: ClipboardEvent) => {
            if (!event.clipboardData?.items) return;

            for (const item of event.clipboardData.items) {
                if (!item.type.includes('image')) continue;
                event.preventDefault();
                const blob = item.getAsFile();
                if (blob) addBlobAttachment(blob);
            }
        };

        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, []);

    const addBlobAttachment = (blob: Blob) => {
        const url = URL.createObjectURL(blob);
        setAttachments(prev => [...prev, {
            id: generateId(),
            type: 'blob',
            val: blob,
            url,
        }]);
        feedback.play('success');
    };

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files.length > 0) {
            Array.from(event.target.files).forEach(file => addBlobAttachment(file));
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const removeAttachment = (id: string) => {
        if (!confirm('确定要删除这张图片吗？\n注意：保存账目后，该图片将从本地和云端永久删除，不可恢复。')) return;
        setAttachments(prev => prev.filter(item => item.id !== id));
    };

    const handleKeyPress = (key: string) => {
        if (key === 'backspace') {
            feedback.play('delete');
            feedback.vibrate('light');
            setAmountStr(prev => deleteFromExpression(prev));
            return;
        }

        if (key === '.') {
            feedback.play('click');
            feedback.vibrate('light');
            setAmountStr(prev => appendDecimalToExpression(prev));
            return;
        }

        if (isOperatorChar(key)) {
            feedback.play('click');
            feedback.vibrate('light');
            setAmountStr(prev => appendOperatorToExpression(prev, key));
            return;
        }

        feedback.play('click');
        feedback.vibrate('light');
        setAmountStr(prev => appendDigitToExpression(prev, key));
    };

    const handleDateChange = (value: string) => {
        const parsed = parseDateInputValue(value);
        if (!parsed) return;
        setDate(parsed);
        feedback.play('switch');
        feedback.vibrate('light');
    };

    const handleSubmit = async () => {
        let amount = 0;
        try {
            amount = evaluateAmountExpression(amountStr);
        } catch (error: any) {
            alert(error?.message || '请输入有效金额');
            return;
        }

        if (amount <= 0 || !selectedCategoryId || isUploading) return;

        setIsUploading(true);
        const finalKeys: string[] = [];
        const removedKeys: string[] = [];

        try {
            for (const item of attachments) {
                if (item.type === 'key') {
                    finalKeys.push(item.val as string);
                } else {
                    const key = await imageService.saveLocalImage(item.val as Blob);
                    finalKeys.push(key);
                }
            }

            if (initialTransaction?.attachments) {
                for (const key of initialTransaction.attachments) {
                    if (!finalKeys.includes(key)) removedKeys.push(key);
                }
            }

            if (removedKeys.length > 0) {
                void Promise.all(removedKeys.map(async key => {
                    await imageService.deleteLocalImage(key);
                    await imageService.deleteRemoteImage(key);
                })).catch(error => console.warn('Deletion error:', error));
            }

            const txData = {
                ledgerId: state.currentLedgerId,
                amount,
                type,
                categoryId: selectedCategoryId,
                date: date.getTime(),
                note,
                attachments: finalKeys,
            };

            if (initialTransaction?.id) {
                updateTransaction({
                    ...initialTransaction,
                    ...txData,
                    id: initialTransaction.id,
                    updatedAt: Date.now(),
                    createdAt: initialTransaction.createdAt || Date.now(),
                    isDeleted: initialTransaction.isDeleted,
                } as Transaction);
            } else {
                addTransaction({
                    ...txData,
                    id: generateId(),
                    createdAt: Date.now(),
                    isDeleted: false,
                });
            }

            setAmountStr('0');
            setNote('');
            setAttachments([]);
            feedback.play('success');
            feedback.vibrate('success');
            onClose();
        } catch (error: any) {
            alert(`保存失败: ${error.message}`);
        } finally {
            setIsUploading(false);
        }
    };

    const displayAmount = useMemo(() => formatExpressionForDisplay(amountStr), [amountStr]);
    const hasFormula = useMemo(() => /[+\-*/]/.test(amountStr), [amountStr]);
    const calculatedAmount = useMemo(() => {
        try {
            return evaluateAmountExpression(amountStr);
        } catch {
            return null;
        }
    }, [amountStr]);
    const inputDateValue = useMemo(() => format(date, 'yyyy-MM-dd'), [date]);

    return (
        <div
            className={clsx(
                'fixed inset-0 z-50 flex flex-col bg-ios-bg overflow-hidden w-full h-full',
                state.settings.enableAnimations && 'animate-slide-up',
                'transition-[padding] duration-300 ease-out'
            )}
            style={{ paddingBottom: keyboardHeight > 0 ? `${keyboardHeight}px` : '0px' }}
        >
            <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2 bg-ios-bg z-10 shrink-0">
                <button onClick={onClose} className="p-2 -ml-2 text-ios-subtext">取消</button>
                <div className="flex bg-gray-200 dark:bg-zinc-800 rounded-lg p-0.5">
                    <button
                        onClick={() => setType('expense')}
                        className={`px-6 py-1.5 rounded-md text-sm font-medium transition-all ${type === 'expense' ? 'bg-white dark:bg-zinc-700 shadow-sm text-ios-text' : 'text-ios-subtext'}`}
                    >
                        支出
                    </button>
                    <button
                        onClick={() => setType('income')}
                        className={`px-6 py-1.5 rounded-md text-sm font-medium transition-all ${type === 'income' ? 'bg-white dark:bg-zinc-700 shadow-sm text-ios-text' : 'text-ios-subtext'}`}
                    >
                        收入
                    </button>
                </div>
                <div className="w-10" />
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar relative min-h-0" onClick={() => { if (isNoteFocused) setIsNoteFocused(false); }}>
                <div className="grid gap-y-6 p-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                    {categories.map(cat => (
                        <button
                            key={cat.id}
                            onClick={() => {
                                setSelectedCategoryId(cat.id);
                                feedback.play('click');
                                feedback.vibrate('light');
                            }}
                            className="flex flex-col items-center gap-2 group"
                        >
                            <div className={clsx(
                                'w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200',
                                selectedCategoryId === cat.id
                                    ? 'bg-ios-primary text-white shadow-lg shadow-blue-500/30 scale-110'
                                    : state.settings.fontContrast === 'high'
                                        ? 'bg-gray-200 dark:bg-zinc-700 text-gray-900 dark:text-gray-100 group-active:scale-95'
                                        : 'bg-gray-100 dark:bg-zinc-800 text-ios-subtext group-active:scale-95'
                            )}>
                                <Icon name={cat.icon} className="w-5 h-5" />
                            </div>
                            <span className={clsx(
                                'text-[10px] transition-colors truncate w-full text-center',
                                selectedCategoryId === cat.id
                                    ? 'text-ios-primary font-medium'
                                    : state.settings.fontContrast === 'high'
                                        ? 'text-gray-900 dark:text-gray-100 font-medium'
                                        : 'text-ios-subtext'
                            )}>
                                {cat.name}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="bg-white dark:bg-zinc-900 rounded-t-3xl shadow-[0_-5px_20px_rgba(0,0,0,0.1)] border-t border-white/10 shrink-0">
                {attachments.length > 0 && (
                    <div className="flex gap-3 overflow-x-auto no-scrollbar px-5 py-3 border-b border-ios-border bg-gray-50 dark:bg-zinc-900/50">
                        {attachments.map(att => (
                            <div key={att.id} className="relative group shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-gray-200 dark:border-zinc-700">
                                <img src={att.url} className="w-full h-full object-cover" alt="attachment" onClick={() => setShowPreview(true)} />
                                <button onClick={() => removeAttachment(att.id)} className="absolute top-0 right-0 p-1 bg-black/50 text-white rounded-bl-lg">
                                    <Icon name="X" className="w-3 h-3" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <div className="px-5 py-3 border-b border-ios-border flex items-center gap-4 relative z-20">
                    <div className="flex items-center gap-2 bg-gray-100 dark:bg-zinc-800 px-3 py-1.5 rounded-xl flex-1 focus-within:ring-2 focus-within:ring-ios-primary/20 transition-all">
                        <button onClick={() => fileInputRef.current?.click()} className="text-ios-subtext active:text-ios-primary active:scale-95 transition-all">
                            <Icon name="Image" className="w-5 h-5" />
                        </button>
                        <input type="file" hidden ref={fileInputRef} accept="image/*" multiple onChange={handleFileSelect} />

                        <input
                            ref={noteInputRef}
                            type="text"
                            placeholder={attachments.length > 0 ? '添加备注...' : '点击粘贴图片或备注...'}
                            value={note}
                            onFocus={() => setIsNoteFocused(true)}
                            onBlur={() => setIsNoteFocused(false)}
                            onChange={event => setNote(event.target.value)}
                            className="bg-transparent text-sm placeholder:text-ios-subtext focus:outline-none flex-1 text-ios-text min-w-0"
                        />
                    </div>

                    <div className="min-w-[35%] text-right">
                        {hasFormula && calculatedAmount !== null && (
                            <div className="text-xs text-ios-subtext tabular-nums">= {formatResultNumber(calculatedAmount)}</div>
                        )}
                        <div className={clsx(
                            'font-bold tracking-tight text-ios-text tabular-nums transition-all duration-200 break-all',
                            displayAmount.length > 16 ? 'text-base' :
                                displayAmount.length > 13 ? 'text-lg' :
                                    displayAmount.length > 10 ? 'text-xl' :
                                        displayAmount.length > 8 ? 'text-2xl' : 'text-3xl'
                        )}>
                            {displayAmount}
                        </div>
                    </div>
                </div>

                {(isNoteFocused || quickNotes.length > 0) && (
                    <div className="flex gap-2 overflow-x-auto no-scrollbar px-5 py-2 border-b border-ios-border bg-gray-50/50 dark:bg-zinc-900/50">
                        {quickNotes.map((quickNote, index) => (
                            <button
                                key={index}
                                onClick={() => setNote(quickNote)}
                                className="flex-shrink-0 px-3 py-1 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-full text-xs text-ios-subtext active:bg-ios-primary active:text-white transition-colors"
                            >
                                {quickNote}
                            </button>
                        ))}
                    </div>
                )}

                <div
                    className={clsx('transition-all duration-300 overflow-hidden', isNoteFocused ? 'h-0 opacity-0' : 'opacity-100')}
                    style={{ height: isNoteFocused ? 0 : `${keypadHeight}vh`, minHeight: isNoteFocused ? 0 : '250px' }}
                >
                    <div className="flex items-center justify-between px-4 py-2 bg-gray-50/50 dark:bg-zinc-900/50 text-xs text-ios-subtext border-b border-ios-border gap-3">
                        <div className="flex gap-2">
                            {[-1, 0, 1].map(offset => {
                                const quickDate = addDays(new Date(), offset);
                                return (
                                    <button
                                        key={offset}
                                        onClick={() => setDate(quickDate)}
                                        className={clsx(
                                            'px-3 py-0.5 rounded-full',
                                            isSameDay(date, quickDate) ? 'bg-ios-primary text-white' : 'bg-gray-200 dark:bg-zinc-800'
                                        )}
                                    >
                                        {offset === 0 ? '今天' : offset === -1 ? '昨天' : '明天'}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="relative shrink-0">
                            <button className="px-3 py-1 rounded-full bg-gray-200 dark:bg-zinc-800 text-ios-text font-medium tabular-nums">
                                {format(date, 'yyyy/MM/dd')}
                            </button>
                            <input
                                type="date"
                                value={inputDateValue}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                onChange={event => handleDateChange(event.target.value)}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-4 grid-rows-4 h-full bg-gray-200 dark:bg-zinc-800 gap-[0.5px] pb-[env(safe-area-inset-bottom)]">
                        {['1', '2', '3'].map(key => <Key key={key} label={key} onClick={() => handleKeyPress(key)} />)}
                        <Key label="-" secondaryLabel="÷" onClick={() => handleKeyPress('-')} onLongPress={() => handleKeyPress('/')} />

                        {['4', '5', '6'].map(key => <Key key={key} label={key} onClick={() => handleKeyPress(key)} />)}
                        <Key label="+" secondaryLabel="×" onClick={() => handleKeyPress('+')} onLongPress={() => handleKeyPress('*')} />

                        {['7', '8', '9'].map(key => <Key key={key} label={key} onClick={() => handleKeyPress(key)} />)}
                        <Key label="删除" icon="Delete" onClick={() => handleKeyPress('backspace')} className="bg-red-100 dark:bg-red-900/30 text-red-600 active:bg-red-200" />

                        <Key label="." onClick={() => handleKeyPress('.')} />
                        <Key label="0" onClick={() => handleKeyPress('0')} />
                        <button
                            onClick={handleSubmit}
                            disabled={isUploading}
                            className="col-span-2 bg-ios-primary text-white text-lg font-medium active:bg-blue-600 transition-colors disabled:opacity-50 flex items-center justify-center"
                        >
                            {isUploading ? <Icon name="Loader" className="animate-spin w-5 h-5" /> : initialTransaction ? '保存' : '完成'}
                        </button>
                    </div>
                </div>
            </div>

            {showPreview && (
                <ImagePreview
                    initialUrls={attachments.map(item => item.url)}
                    onClose={() => setShowPreview(false)}
                />
            )}
        </div>
    );
};

interface KeyProps {
    label: string;
    icon?: string;
    onClick: () => void;
    onLongPress?: () => void;
    secondaryLabel?: string;
    className?: string;
}

const Key: React.FC<KeyProps> = ({ label, icon, onClick, onLongPress, secondaryLabel, className }) => {
    const timerRef = useRef<number | null>(null);
    const longPressTriggeredRef = useRef(false);

    const clearTimer = () => {
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    };

    const handlePointerDown = () => {
        if (!onLongPress) return;
        longPressTriggeredRef.current = false;
        timerRef.current = window.setTimeout(() => {
            longPressTriggeredRef.current = true;
            onLongPress();
        }, LONG_PRESS_MS);
    };

    const handlePointerUp = () => {
        if (!onLongPress) return;
        clearTimer();
        if (!longPressTriggeredRef.current) {
            onClick();
        }
        longPressTriggeredRef.current = false;
    };

    const handlePointerCancel = () => {
        clearTimer();
        longPressTriggeredRef.current = false;
    };

    return (
        <button
            onClick={onLongPress ? undefined : onClick}
            onPointerDown={onLongPress ? handlePointerDown : undefined}
            onPointerUp={onLongPress ? handlePointerUp : undefined}
            onPointerLeave={onLongPress ? handlePointerCancel : undefined}
            onPointerCancel={onLongPress ? handlePointerCancel : undefined}
            onContextMenu={event => onLongPress ? event.preventDefault() : undefined}
            className={clsx(
                'relative bg-white dark:bg-zinc-900 active:bg-gray-100 dark:active:bg-zinc-700 flex items-center justify-center text-2xl font-light transition-colors select-none touch-manipulation',
                className
            )}
        >
            {secondaryLabel && (
                <span className="absolute top-2 right-3 text-xs text-ios-subtext pointer-events-none">{secondaryLabel}</span>
            )}
            {icon ? <Icon name={icon} className="w-6 h-6" /> : label}
        </button>
    );
};
