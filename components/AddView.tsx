
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

interface AddViewProps {
    onClose: () => void;
    initialTransaction?: Partial<Transaction>;
    initialClipboardImage?: string;
}

// Helper for preview
interface AttachmentItem {
    id: string;
    type: 'key' | 'blob';
    val: string | Blob;
    url: string;
}

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

    // Attachment State
    const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
    const [isUploading, setIsUploading] = useState(false);

    // KEYBOARD STRATEGY: CAPACITOR PLUGIN EVENTS
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
            if (initialTransaction.attachments && initialTransaction.attachments.length > 0) {
                // For existing R2 keys, we just use the key as URL (imageService handles proxy if needed, or we assume key is enough for now)
                // NOTE: To display R2 private images, we need to fetch distinct blob or use a proxy route.
                // For simplicity in Phase 2, we assume we can build a URL.
                // But wait, the Worker requires Auth for GET /image/:key. <img> tag won't send header.
                // So we must fetch blobs for existing images OR use a signed token/cookie.
                // We will async fetch blobs for existing keys.
                const loadExisting = async () => {
                    const items: AttachmentItem[] = [];
                    for (const key of initialTransaction.attachments!) {
                        try {
                            const blob = await imageService.fetchImageBlob(key);
                            const url = URL.createObjectURL(blob);
                            items.push({ id: key, type: 'key', val: key, url: url });
                        } catch (e) {
                            console.warn("Failed to load image", key);
                        }
                    }
                    setAttachments(items);
                };
                loadExisting();
            }
        }
        if (categories.length > 0) {
            const isValid = selectedCategoryId && categories.some(c => c.id === selectedCategoryId);
            if (!isValid && !initialTransaction?.categoryId) setSelectedCategoryId(categories[0].id);
        } else if (selectedCategoryId !== null) {
            setSelectedCategoryId(null);
        }
    }, [type, categories, initialTransaction]);

    // Handle Initial Clipboard Image (from Layout)
    useEffect(() => {
        if (initialClipboardImage) {
            const processClipboard = async () => {
                try {
                    setIsUploading(true);
                    const base64 = initialClipboardImage.startsWith('data:') ? initialClipboardImage : `data:image/png;base64,${initialClipboardImage}`;
                    const res = await fetch(base64);
                    const blob = await res.blob();
                    const file = new File([blob], `clipboard_${Date.now()}.png`, { type: blob.type || 'image/png' });
                    const key = await imageService.uploadImage(file);
                    const url = URL.createObjectURL(blob);
                    setAttachments(prev => [...prev, { id: key, type: 'key', val: key, url }]);
                    feedback.play('success');
                } catch (e) {
                    console.error("Clipboard paste failed", e);
                    feedback.play('error');
                } finally {
                    setIsUploading(false);
                }
            };
            processClipboard();
        }
    }, [initialClipboardImage]);

    const quickNotes = useMemo(() => {
        if (!selectedCategoryId) return [];
        return state.settings.categoryNotes?.[selectedCategoryId] || [];
    }, [selectedCategoryId, state.settings.categoryNotes]);

    // Handle Paste
    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            if (e.clipboardData?.items) {
                for (const item of e.clipboardData.items) {
                    if (item.type.indexOf('image') !== -1) {
                        e.preventDefault();
                        const blob = item.getAsFile();
                        if (blob) addBlobAttachment(blob);
                    }
                }
            }
        };
        // Listen globally to capture paste even if input not focused (sometimes helpful on mobile if window focused)
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, []);

    const addBlobAttachment = (blob: Blob) => {
        const url = URL.createObjectURL(blob);
        setAttachments(prev => [...prev, {
            id: generateId(),
            type: 'blob',
            val: blob,
            url
        }]);
        feedback.play('success');
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            Array.from(e.target.files).forEach(file => addBlobAttachment(file));
        }
        // reset
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const removeAttachment = (id: string) => {
        if (!confirm("确定要删除这张图片吗？\n注意：保存账目后，该图片将从本地和云端永久删除，不可恢复。")) return;
        setAttachments(prev => prev.filter(a => a.id !== id));
    };

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

    const handleSubmit = async () => {
        const amount = parseFloat(amountStr);
        if (amount <= 0 || !selectedCategoryId) return;
        if (isUploading) return;

        setIsUploading(true);
        const finalKeys: string[] = [];
        const removedKeys: string[] = [];

        try {
            // Process Attachments
            for (const item of attachments) {
                if (item.type === 'key') {
                    finalKeys.push(item.val as string);
                } else if (item.type === 'blob') {
                    // Save locally first (returns key)
                    const key = await imageService.saveLocalImage(item.val as Blob);
                    finalKeys.push(key);
                }
            }

            // Detect deleted remote images
            if (initialTransaction && initialTransaction.attachments) {
                const initialKeys = initialTransaction.attachments;
                for (const k of initialKeys) {
                    if (!finalKeys.includes(k)) {
                        removedKeys.push(k);
                    }
                }
            }

            // Execute deletions (Fire and forget, don't block save)
            if (removedKeys.length > 0) {
                Promise.all(removedKeys.map(async (k) => {
                    await imageService.deleteLocalImage(k);
                    await imageService.deleteRemoteImage(k);
                })).catch(e => console.warn("Deletion error:", e));
            }

            const txData = {
                ledgerId: state.currentLedgerId,
                amount, type, categoryId: selectedCategoryId, date: date.getTime(), note,
                attachments: finalKeys,
            };

            if (initialTransaction && initialTransaction.id) {
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
        } catch (e: any) {
            alert("保存失败: " + e.message);
        } finally {
            setIsUploading(false);
        }
    };

    const displayAmount = useMemo(() => {
        const parts = amountStr.split('.');
        const intPart = parseInt(parts[0] || '0').toLocaleString('en-US');
        return parts.length > 1 ? `${intPart}.${parts[1]}` : intPart;
    }, [amountStr]);

    return (
        <div
            className={clsx(
                "fixed inset-0 z-50 flex flex-col bg-ios-bg overflow-hidden w-full h-full",
                state.settings.enableAnimations && "animate-slide-up",
                "transition-[padding] duration-300 ease-out"
            )}
            style={{
                paddingBottom: keyboardHeight > 0 ? `${keyboardHeight}px` : '0px'
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

            {/* 2. Content Area */}
            <div className="flex-1 overflow-y-auto no-scrollbar relative min-h-0" onClick={() => { if (isNoteFocused) setIsNoteFocused(false); }}>
                <div className="grid gap-y-6 p-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                    {categories.map(cat => (
                        <button key={cat.id} onClick={() => { setSelectedCategoryId(cat.id); feedback.play('click'); feedback.vibrate('light'); }} className="flex flex-col items-center gap-2 group">
                            <div className={clsx(
                                "w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200",
                                selectedCategoryId === cat.id
                                    ? "bg-ios-primary text-white shadow-lg shadow-blue-500/30 scale-110"
                                    : state.settings.fontContrast === 'high'
                                        ? "bg-gray-200 dark:bg-zinc-700 text-gray-900 dark:text-gray-100 group-active:scale-95"
                                        : "bg-gray-100 dark:bg-zinc-800 text-ios-subtext group-active:scale-95"
                            )}>
                                <Icon name={cat.icon} className="w-5 h-5" />
                            </div>
                            <span className={clsx(
                                "text-[10px] transition-colors truncate w-full text-center",
                                selectedCategoryId === cat.id
                                    ? "text-ios-primary font-medium"
                                    : state.settings.fontContrast === 'high'
                                        ? "text-gray-900 dark:text-gray-100 font-medium"
                                        : "text-ios-subtext"
                            )}>{cat.name}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* 3. Footer */}
            <div className={clsx(
                "bg-white dark:bg-zinc-900 rounded-t-3xl shadow-[0_-5px_20px_rgba(0,0,0,0.1)] border-t border-white/10 shrink-0",
            )}>
                {/* Pending Attachments Row */}
                {attachments.length > 0 && (
                    <div className="flex gap-3 overflow-x-auto no-scrollbar px-5 py-3 border-b border-ios-border bg-gray-50 dark:bg-zinc-900/50">
                        {attachments.map((att) => (
                            <div key={att.id} className="relative group shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-gray-200 dark:border-zinc-700">
                                <img src={att.url} className="w-full h-full object-cover" alt="attachment" />
                                <button onClick={() => removeAttachment(att.id)} className="absolute top-0 right-0 p-1 bg-black/50 text-white rounded-bl-lg">
                                    <Icon name="X" className="w-3 h-3" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Note Input Row */}
                <div className="px-5 py-3 border-b border-ios-border flex items-center gap-4 relative z-20">
                    <div className="flex items-center gap-2 bg-gray-100 dark:bg-zinc-800 px-3 py-1.5 rounded-xl flex-1 focus-within:ring-2 focus-within:ring-ios-primary/20 transition-all">
                        {/* Image Button */}
                        <button onClick={() => fileInputRef.current?.click()} className="text-ios-subtext active:text-ios-primary active:scale-95 transition-all">
                            <Icon name="Image" className="w-5 h-5" />
                        </button>
                        <input type="file" hidden ref={fileInputRef} accept="image/*" multiple onChange={handleFileSelect} />

                        <input
                            ref={noteInputRef}
                            type="text"
                            placeholder={attachments.length > 0 ? "添加备注..." : "点击粘贴图片或备注..."}
                            value={note}
                            onFocus={() => setIsNoteFocused(true)}
                            onBlur={() => setIsNoteFocused(false)}
                            onChange={(e) => setNote(e.target.value)}
                            onPaste={(e) => {
                                // Redundant if global listener works, but safer to keep default behavior for text
                                // If image handled by global, stop propagation?
                                // Let's rely on global or specific check.
                            }}
                            className="bg-transparent text-sm placeholder:text-ios-subtext focus:outline-none flex-1 text-ios-text min-w-0"
                        />
                    </div>
                    <div className={clsx(
                        "font-bold tracking-tight text-ios-text min-w-[30%] text-right tabular-nums transition-all duration-200",
                        amountStr.length > 13 ? "text-lg" :
                            amountStr.length > 10 ? "text-xl" :
                                amountStr.length > 8 ? "text-2xl" : "text-3xl"
                    )}>
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
                        <button onClick={handleSubmit} disabled={isUploading} className="col-span-2 bg-ios-primary text-white text-lg font-medium active:bg-blue-600 transition-colors disabled:opacity-50 flex items-center justify-center">
                            {isUploading ? <Icon name="Loader" className="animate-spin w-5 h-5" /> : initialTransaction ? '保存' : '完成'}
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
