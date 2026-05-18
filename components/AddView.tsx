import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useApp } from '../contexts/AppContext';
import { Icon } from './ui/Icon';
import { feedback } from '../services/feedback';
import { TransactionType, Transaction, TradeAllocation, TradeKeyAllocation, TradeKey } from '../types';
import { generateId } from '../utils';
import { clsx } from 'clsx';
import { format, addDays, isSameDay } from 'date-fns';
import { Keyboard } from '@capacitor/keyboard';
import { Capacitor } from '@capacitor/core';
import { Clipboard } from '@capacitor/clipboard';
import { imageService } from '../services/imageService';
import { ImagePreview } from './ImagePreview';
import { getAvailableTradeBuyLots, getAvailableTradeCardKeys, getSuggestedTradeAllocations, getSuggestedTradeKeyAllocations, getTradingAllocationCost, getTradingBuyUnitCost, isTradingLedger, normalizeTradeAllocations, normalizeTradeKeyAllocations, normalizeTradeKeys, tradeKeyAllocationsToTradeAllocations } from '../services/ledgerUtils';

interface AddViewProps {
    onClose: () => void;
    initialTransaction?: Partial<Transaction>;
    initialClipboardImage?: string;
    initialType?: TransactionType;
    targetLedgerId?: string;
}

interface AttachmentItem {
    id: string;
    type: 'key' | 'blob';
    val: string | Blob;
    url: string;
}

type Operator = '+' | '-' | '*' | '/';
type KeypadField = 'amount' | 'quantity' | 'feeRate';

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

const appendDigitToNumberInput = (value: string, digit: string) => {
    if (!value || value === '0') return digit;
    return `${value}${digit}`;
};

const appendDecimalToNumberInput = (value: string) => {
    if (value.includes('.')) return value;
    return value ? `${value}.` : '0.';
};

const deleteFromNumberInput = (value: string) => {
    if (value.length <= 1) return '';
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

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const getTransactionInputAmount = (transaction?: Partial<Transaction> | null) => {
    if (!transaction) return '0';
    const amount = transaction.tradeGrossAmount ?? transaction.amount;
    if (amount === undefined) return '0';

    const quantity = Number(transaction.tradeQuantity || 0);
    if (transaction.tradeGrossAmount !== undefined && Number.isFinite(quantity) && quantity > 0) {
        return String(roundMoney(Number(transaction.tradeGrossAmount) / quantity));
    }

    return String(amount);
};

const allocationsToInputMap = (allocations?: TradeAllocation[]) =>
    (allocations || []).reduce<Record<string, string>>((map, allocation) => {
        map[allocation.buyTransactionId] = String(allocation.quantity);
        return map;
    }, {});

const keyAllocationsToInputMap = (allocations?: TradeKeyAllocation[]) =>
    (allocations || []).reduce<Record<string, string>>((map, allocation) => {
        const current = Number(map[allocation.buyTransactionId] || 0);
        map[allocation.buyTransactionId] = String(current + 1);
        return map;
    }, {});

const getCategoryFeeRate = (category: { buyFeeRate?: number; sellFeeRate?: number } | undefined, type: TransactionType) =>
    type === 'income' ? category?.sellFeeRate ?? 0 : category?.buyFeeRate ?? 0;

const normalizeCardKeyQuantity = (value: string) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
};

export const AddView: React.FC<AddViewProps> = ({ onClose, initialTransaction, initialClipboardImage, initialType = 'expense', targetLedgerId }) => {
    const { state, addTransaction, updateTransaction } = useApp();
    const targetLedgerExists = !!targetLedgerId && state.ledgers.some(ledger => ledger.id === targetLedgerId);
    const effectiveLedgerId = initialTransaction?.ledgerId || (targetLedgerExists ? targetLedgerId : state.currentLedgerId);
    const currentLedger = state.ledgers.find(ledger => ledger.id === effectiveLedgerId);
    const isTrading = isTradingLedger(currentLedger);
    const [type, setType] = useState<TransactionType>(() => initialTransaction?.type || initialType);
    const [amountStr, setAmountStr] = useState(() => getTransactionInputAmount(initialTransaction));
    const [quantityStr, setQuantityStr] = useState(() => initialTransaction?.tradeQuantity !== undefined ? String(initialTransaction.tradeQuantity) : '1');
    const [feeRateStr, setFeeRateStr] = useState(() => initialTransaction?.tradeFeeRate !== undefined ? String(initialTransaction.tradeFeeRate) : '0');
    const [activeKeypadField, setActiveKeypadField] = useState<KeypadField>('amount');
    const [sellAllocationInputs, setSellAllocationInputs] = useState<Record<string, string>>(() =>
        allocationsToInputMap(normalizeTradeAllocations(initialTransaction?.tradeAllocations))
    );
    const [tradeKeyInputs, setTradeKeyInputs] = useState<TradeKey[]>(() =>
        normalizeTradeKeys(initialTransaction?.tradeKeys) || []
    );
    const [cardKeySellMode, setCardKeySellMode] = useState<'auto' | 'batch'>(() =>
        normalizeTradeKeyAllocations(initialTransaction?.tradeKeyAllocations)?.length ? 'batch' : 'auto'
    );
    const [cardKeyBatchInputs, setCardKeyBatchInputs] = useState<Record<string, string>>(() =>
        keyAllocationsToInputMap(normalizeTradeKeyAllocations(initialTransaction?.tradeKeyAllocations))
    );
    const [showSellCategoryPicker, setShowSellCategoryPicker] = useState(() =>
        isTrading && initialTransaction?.type === 'income' && !initialTransaction?.categoryId
    );
    const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(() => initialTransaction?.categoryId || null);
    const [note, setNote] = useState(() => initialTransaction?.note || '');
    const [date, setDate] = useState(() => initialTransaction?.date ? new Date(initialTransaction.date) : new Date());
    const [isNoteFocused, setIsNoteFocused] = useState(false);
    const noteInputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const inferredAllocationRef = useRef<string | null>(null);

    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return;

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
        .filter(c => (isTrading ? c.type === 'trade' : c.type === type) && c.ledgerId === effectiveLedgerId)
        .sort((a, b) => a.order - b.order), [state.categories, type, effectiveLedgerId, isTrading]);

    const selectedCategory = useMemo(
        () => categories.find(category => category.id === selectedCategoryId),
        [categories, selectedCategoryId]
    );
    const isCardKeyCategory = isTrading && selectedCategory?.tradeItemType === 'cardKey';

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
            setType(initialTransaction.type || initialType);
            setAmountStr(getTransactionInputAmount(initialTransaction));
            setQuantityStr(initialTransaction.tradeQuantity !== undefined ? String(initialTransaction.tradeQuantity) : '1');
            setFeeRateStr(initialTransaction.tradeFeeRate !== undefined ? String(initialTransaction.tradeFeeRate) : '0');
            setSellAllocationInputs(allocationsToInputMap(normalizeTradeAllocations(initialTransaction.tradeAllocations)));
            setTradeKeyInputs(normalizeTradeKeys(initialTransaction.tradeKeys) || []);
            setCardKeyBatchInputs(keyAllocationsToInputMap(normalizeTradeKeyAllocations(initialTransaction.tradeKeyAllocations)));
            setCardKeySellMode(normalizeTradeKeyAllocations(initialTransaction.tradeKeyAllocations)?.length ? 'batch' : 'auto');
            setShowSellCategoryPicker(isTrading && initialTransaction.type === 'income' && !initialTransaction.categoryId);
            setSelectedCategoryId(initialTransaction.categoryId || null);
            setNote(initialTransaction.note || '');
            setDate(initialTransaction.date ? new Date(initialTransaction.date) : new Date());
            void loadInitialAttachments();
        } else {
            setType(initialType);
            setAmountStr('0');
            setQuantityStr('1');
            setFeeRateStr('0');
            setSellAllocationInputs({});
            setTradeKeyInputs([]);
            setCardKeyBatchInputs({});
            setCardKeySellMode('auto');
            setShowSellCategoryPicker(false);
            setSelectedCategoryId(null);
            setNote('');
            setDate(new Date());
            setAttachments([]);
        }

        return () => {
            cancelled = true;
        };
    }, [initialTransaction, initialType, isTrading, effectiveLedgerId]);

    useEffect(() => {
        if (categories.length === 0) {
            setSelectedCategoryId(null);
            return;
        }

        const stillValid = selectedCategoryId && categories.some(c => c.id === selectedCategoryId);
        if (isTrading && type === 'income') {
            if (!stillValid && selectedCategoryId) setSelectedCategoryId(null);
            return;
        }

        if (!stillValid) {
            setSelectedCategoryId(categories[0].id);
        }
    }, [categories, selectedCategoryId, isTrading, type]);

    useEffect(() => {
        if (isTrading && type === 'income' && !selectedCategoryId) {
            setShowSellCategoryPicker(true);
        }
    }, [isTrading, type, selectedCategoryId]);

    useEffect(() => {
        if (!isTrading || !selectedCategory) return;
        const shouldUseSavedFeeRate =
            initialTransaction?.id &&
            initialTransaction.categoryId === selectedCategoryId &&
            initialTransaction.type === type &&
            initialTransaction.tradeFeeRate !== undefined;
        setFeeRateStr(String(shouldUseSavedFeeRate ? initialTransaction.tradeFeeRate : getCategoryFeeRate(selectedCategory, type)));
    }, [isTrading, selectedCategoryId, selectedCategory, type, initialTransaction?.id, initialTransaction?.categoryId, initialTransaction?.type, initialTransaction?.tradeFeeRate]);

    useEffect(() => {
        if (!isCardKeyCategory || type !== 'expense') {
            setTradeKeyInputs([]);
            return;
        }

        const count = normalizeCardKeyQuantity(quantityStr);
        setTradeKeyInputs(prev => {
            const next = prev.slice(0, count);
            while (next.length < count) {
                next.push({ id: generateId(), value: '' });
            }
            return next;
        });
    }, [isCardKeyCategory, type, quantityStr]);

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
                const key = await imageService.saveLocalImage(file);
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

    const availableSellLots = useMemo(() => {
        if (!isTrading || type !== 'income' || !selectedCategoryId) return [];
        return getAvailableTradeBuyLots(state.transactions, effectiveLedgerId, selectedCategoryId, initialTransaction?.id);
    }, [isTrading, type, selectedCategoryId, state.transactions, effectiveLedgerId, initialTransaction?.id]);

    const availableSellCardKeys = useMemo(() => {
        if (!isCardKeyCategory || type !== 'income' || !selectedCategoryId) return [];
        return getAvailableTradeCardKeys(state.transactions, effectiveLedgerId, selectedCategoryId, initialTransaction?.id);
    }, [isCardKeyCategory, type, selectedCategoryId, state.transactions, effectiveLedgerId, initialTransaction?.id]);

    const cardKeyBatchOptions = useMemo(() => {
        const grouped = new Map<string, {
            buyTransactionId: string;
            transaction: Transaction;
            remainingKeys: typeof availableSellCardKeys;
        }>();

        availableSellCardKeys.forEach(item => {
            const existing = grouped.get(item.buyTransactionId);
            if (existing) {
                existing.remainingKeys.push(item);
                return;
            }
            grouped.set(item.buyTransactionId, {
                buyTransactionId: item.buyTransactionId,
                transaction: item.transaction,
                remainingKeys: [item],
            });
        });

        return Array.from(grouped.values());
    }, [availableSellCardKeys]);

    const cardKeyBuyTransactionMap = useMemo(() => {
        const map = new Map<string, Transaction>();
        state.transactions.forEach(transaction => {
            if (
                !transaction.isDeleted &&
                transaction.ledgerId === effectiveLedgerId &&
                transaction.categoryId === selectedCategoryId &&
                transaction.tradeAction === 'buy'
            ) {
                map.set(transaction.id, transaction);
            }
        });
        return map;
    }, [state.transactions, effectiveLedgerId, selectedCategoryId]);

    const getCardKeyBatchLabel = (buyTransactionId: string) => {
        const transaction = cardKeyBuyTransactionMap.get(buyTransactionId);
        if (!transaction) return '来自买入记录';

        const note = (transaction.note || '').trim() || '买入记录';
        const unitCost = getTradingBuyUnitCost(transaction);
        const costLabel = unitCost !== null ? ` · 成本 ${formatResultNumber(unitCost)}` : '';
        return `来自 ${format(transaction.date, 'yyyy/MM/dd')} ${note}${costLabel}`;
    };

    const getCardKeyBatchInputTotal = (inputs: Record<string, string>) =>
        Object.values(inputs).reduce((sum, value) => {
            const quantity = Math.max(0, Math.floor(Number(value || 0)));
            return Number.isFinite(quantity) ? sum + quantity : sum;
        }, 0);

    const buildCardKeyBatchInputsForQuantity = (quantity: number) => {
        let remaining = Math.max(0, Math.min(Math.floor(quantity), availableSellCardKeys.length));
        const next: Record<string, string> = {};

        cardKeyBatchOptions.forEach(option => {
            if (remaining <= 0) return;
            const count = Math.min(option.remainingKeys.length, remaining);
            if (count > 0) {
                next[option.buyTransactionId] = String(count);
                remaining -= count;
            }
        });

        return next;
    };

    const setLinkedCardKeyBatchInputs = (inputs: Record<string, string>) => {
        setCardKeyBatchInputs(inputs);
        setQuantityStr(String(getCardKeyBatchInputTotal(inputs)));
    };

    const updateCardKeySellQuantity = (value: string) => {
        if (cardKeySellMode === 'batch') {
            const inputs = buildCardKeyBatchInputsForQuantity(normalizeCardKeyQuantity(value));
            setLinkedCardKeyBatchInputs(inputs);
            return;
        }

        setQuantityStr(value);
    };

    useEffect(() => {
        if (!isTrading || type !== 'income' || !initialTransaction?.id || !selectedCategoryId) return;
        if (normalizeTradeAllocations(initialTransaction.tradeAllocations)?.length) return;
        if (inferredAllocationRef.current === initialTransaction.id) return;

        const quantity = Number(initialTransaction.tradeQuantity || 0);
        const suggested = getSuggestedTradeAllocations(
            state.transactions,
            effectiveLedgerId,
            selectedCategoryId,
            quantity,
            initialTransaction.id
        );
        setSellAllocationInputs(allocationsToInputMap(suggested));
        inferredAllocationRef.current = initialTransaction.id;
    }, [isTrading, type, initialTransaction?.id, initialTransaction?.tradeQuantity, initialTransaction?.tradeAllocations, selectedCategoryId, state.transactions, effectiveLedgerId]);

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

    const activateKeypadField = (field: KeypadField) => {
        noteInputRef.current?.blur();
        setIsNoteFocused(false);
        setActiveKeypadField(field);
    };

    const updateQuantityFromKeypad = (nextValue: string) => {
        if (isCardKeyCategory && type === 'income') {
            updateCardKeySellQuantity(nextValue);
            return;
        }

        setQuantityStr(nextValue);
    };

    const updateActiveKeypadValue = (updater: (value: string) => string) => {
        if (activeKeypadField === 'amount') {
            setAmountStr(updater);
            return;
        }

        if (activeKeypadField === 'quantity') {
            updateQuantityFromKeypad(updater(quantityStr));
            return;
        }

        setFeeRateStr(updater(feeRateStr));
    };

    const handleKeyPress = (key: string) => {
        if (key === 'backspace') {
            feedback.play('delete');
            feedback.vibrate('light');
            if (activeKeypadField === 'amount') {
                setAmountStr(prev => deleteFromExpression(prev));
            } else {
                updateActiveKeypadValue(deleteFromNumberInput);
            }
            return;
        }

        if (key === '.') {
            if (activeKeypadField === 'quantity' && isCardKeyCategory) return;

            feedback.play('click');
            feedback.vibrate('light');
            if (activeKeypadField === 'amount') {
                setAmountStr(prev => appendDecimalToExpression(prev));
            } else {
                updateActiveKeypadValue(appendDecimalToNumberInput);
            }
            return;
        }

        if (isOperatorChar(key)) {
            if (activeKeypadField !== 'amount') return;

            feedback.play('click');
            feedback.vibrate('light');
            setAmountStr(prev => appendOperatorToExpression(prev, key));
            return;
        }

        feedback.play('click');
        feedback.vibrate('light');
        if (activeKeypadField === 'amount') {
            setAmountStr(prev => appendDigitToExpression(prev, key));
        } else {
            updateActiveKeypadValue(prev => appendDigitToNumberInput(prev, key));
        }
    };

    const handleDateChange = (value: string) => {
        const parsed = parseDateInputValue(value);
        if (!parsed) return;
        setDate(parsed);
        feedback.play('switch');
        feedback.vibrate('light');
    };

    const handleTypeSelect = (nextType: TransactionType) => {
        setType(nextType);
        feedback.play('switch');
        feedback.vibrate('light');

        if (isTrading && nextType === 'income') {
            if (!initialTransaction?.id) {
                setSelectedCategoryId(null);
                setSellAllocationInputs({});
            }
            setShowSellCategoryPicker(true);
            return;
        }

        setShowSellCategoryPicker(false);
    };

    const handleSellCategorySelect = (categoryId: string) => {
        const category = categories.find(item => item.id === categoryId);
        setSelectedCategoryId(categoryId);
        setFeeRateStr(String(getCategoryFeeRate(category, 'income')));
        setSellAllocationInputs({});
        setCardKeyBatchInputs({});
        setCardKeySellMode('auto');
        setShowSellCategoryPicker(false);
        feedback.play('click');
        feedback.vibrate('light');
    };

    const handleSellCategoryCancel = () => {
        if (!initialTransaction?.id && !selectedCategoryId) {
            onClose();
            return;
        }

        setShowSellCategoryPicker(false);
    };

    const updateSellAllocationInput = (buyTransactionId: string, value: string, maxQuantity: number) => {
        if (value.trim() === '') {
            setSellAllocationInputs(prev => ({ ...prev, [buyTransactionId]: '' }));
            return;
        }

        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return;
        const clamped = Math.max(0, Math.min(parsed, maxQuantity));
        setSellAllocationInputs(prev => ({
            ...prev,
            [buyTransactionId]: clamped === 0 ? '' : String(clamped),
        }));
    };

    const adjustSellAllocationInput = (buyTransactionId: string, delta: number, maxQuantity: number) => {
        const current = Number(sellAllocationInputs[buyTransactionId] || 0);
        const next = Math.max(0, Math.min((Number.isFinite(current) ? current : 0) + delta, maxQuantity));
        setSellAllocationInputs(prev => ({
            ...prev,
            [buyTransactionId]: next === 0 ? '' : String(roundMoney(next)),
        }));
        feedback.play('click');
        feedback.vibrate('light');
    };

    const updateCardKeyBatchInput = (buyTransactionId: string, value: string, maxQuantity: number) => {
        if (value.trim() === '') {
            setLinkedCardKeyBatchInputs({ ...cardKeyBatchInputs, [buyTransactionId]: '' });
            return;
        }

        const parsed = Math.floor(Number(value));
        if (!Number.isFinite(parsed)) return;
        const clamped = Math.max(0, Math.min(parsed, maxQuantity));
        setLinkedCardKeyBatchInputs({
            ...cardKeyBatchInputs,
            [buyTransactionId]: clamped === 0 ? '' : String(clamped),
        });
    };

    const adjustCardKeyBatchInput = (buyTransactionId: string, delta: number, maxQuantity: number) => {
        const current = Number(cardKeyBatchInputs[buyTransactionId] || 0);
        const next = Math.max(0, Math.min((Number.isFinite(current) ? current : 0) + delta, maxQuantity));
        setLinkedCardKeyBatchInputs({
            ...cardKeyBatchInputs,
            [buyTransactionId]: next === 0 ? '' : String(next),
        });
        feedback.play('click');
        feedback.vibrate('light');
    };

    const handleCategorySelect = (categoryId: string) => {
        const category = categories.find(item => item.id === categoryId);
        setSelectedCategoryId(categoryId);
        if (isTrading) setFeeRateStr(String(getCategoryFeeRate(category, type)));
        feedback.play('click');
        feedback.vibrate('light');
    };

    const updateTradeKeyInput = (index: number, value: string) => {
        setTradeKeyInputs(prev => prev.map((item, itemIndex) => (
            itemIndex === index ? { ...item, value } : item
        )));
    };

    const copyTextWithTextarea = (text: string) => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', 'true');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '0';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);
        const copied = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (!copied) throw new Error('clipboard fallback failed');
    };

    const copyText = async (text: string, successMessage?: string) => {
        try {
            if (Capacitor.isNativePlatform()) {
                try {
                    await Clipboard.write({ string: text });
                } catch {
                    copyTextWithTextarea(text);
                }
            } else if (navigator.clipboard?.writeText) {
                try {
                    await navigator.clipboard.writeText(text);
                } catch {
                    copyTextWithTextarea(text);
                }
            } else {
                copyTextWithTextarea(text);
            }
            feedback.play('success');
            feedback.vibrate('light');
            if (successMessage) alert(successMessage);
        } catch (error: any) {
            alert(`复制失败: ${error?.message || 'clipboard unavailable'}`);
        }
    };

    const handleSubmit = async () => {
        let inputAmount = 0;
        try {
            inputAmount = evaluateAmountExpression(amountStr);
        } catch (error: any) {
            alert(error?.message || '请输入有效金额');
            return;
        }

        const isCardKeyBuy = isCardKeyCategory && type === 'expense';
        const isCardKeySell = isCardKeyCategory && type === 'income';
        const cardKeySellQuantity = isCardKeySell ? normalizeCardKeyQuantity(quantityStr) : 0;
        const cardKeyBatchAllocations = isCardKeySell ? tradeKeyAllocationsToTradeAllocations(selectedTradeKeyAllocations) || [] : [];
        const lotMap = new Map(availableSellLots.map(lot => [lot.buyTransactionId, lot]));
        const sellAllocations = isTrading && type === 'income'
            ? isCardKeySell
                ? cardKeyBatchAllocations.map(allocation => ({
                    buyTransactionId: allocation.buyTransactionId,
                    quantity: allocation.quantity,
                    maxQuantity: lotMap.get(allocation.buyTransactionId)?.remainingQuantity ?? allocation.quantity,
                }))
                : availableSellLots
                .map(lot => ({
                    buyTransactionId: lot.buyTransactionId,
                    quantity: roundMoney(Number(sellAllocationInputs[lot.buyTransactionId] || 0)),
                    maxQuantity: lot.remainingQuantity,
                }))
                .filter(allocation => Number.isFinite(allocation.quantity) && allocation.quantity > 0)
            : [];
        const quantity = isTrading && type === 'income'
            ? isCardKeySell ? cardKeySellQuantity : roundMoney(sellAllocations.reduce((sum, allocation) => sum + allocation.quantity, 0))
            : Number(quantityStr);
        if (inputAmount <= 0 || !selectedCategoryId || isUploading) return;
        if (isTrading && (!Number.isFinite(quantity) || quantity <= 0)) {
            alert(type === 'income' ? '请选择要卖出的买入批次和数量' : '请输入有效数量');
            return;
        }
        if ((isCardKeyBuy || isCardKeySell) && Math.floor(quantity) !== quantity) {
            alert('卡密数量必须是整数');
            return;
        }
        const preparedTradeKeys = isCardKeyBuy
            ? tradeKeyInputs.slice(0, quantity).map(item => ({ id: item.id, value: item.value.trim() }))
            : undefined;
        if (isCardKeyBuy) {
            if (!preparedTradeKeys || preparedTradeKeys.length !== quantity || preparedTradeKeys.some(item => !item.value)) {
                alert('请输入完整卡密');
                return;
            }
            const keyValues = preparedTradeKeys.map(item => item.value);
            if (new Set(keyValues).size !== keyValues.length) {
                alert('同一买入记录中不能重复录入卡密');
                return;
            }
        }
        if (isCardKeySell && selectedTradeKeyAllocations.length !== quantity) {
            alert(cardKeySellMode === 'batch'
                ? `所选批次数量需等于卖出数量，当前已选 ${selectedTradeKeyAllocations.length}`
                : `卡密库存不足，当前可卖数量为 ${availableSellCardKeys.length}`);
            return;
        }

        const grossAmount = isTrading ? roundMoney(inputAmount * quantity) : inputAmount;
        const defaultFeeRate = getCategoryFeeRate(selectedCategory, type);
        const parsedFeeRate = feeRateStr.trim() === '' ? defaultFeeRate : Number(feeRateStr);
        if (isTrading && (!Number.isFinite(parsedFeeRate) || parsedFeeRate < 0)) {
            alert('请输入有效手续费率');
            return;
        }
        const feeRate = isTrading ? parsedFeeRate : 0;
        const feeAmount = roundMoney(grossAmount * feeRate / 100);
        const amount = isTrading
            ? Math.max(0, roundMoney(type === 'expense' ? grossAmount + feeAmount : grossAmount - feeAmount))
            : grossAmount;

        if (isTrading && type === 'income') {
            const exceededAllocation = sellAllocations.find(allocation => allocation.quantity > allocation.maxQuantity);
            if (exceededAllocation) {
                alert(`批次剩余不足，当前批次可卖数量为 ${exceededAllocation.maxQuantity}`);
                return;
            }
        }

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
                ledgerId: effectiveLedgerId,
                amount,
                type,
                categoryId: selectedCategoryId,
                ...(isTrading ? {
                    tradeAction: type === 'income' ? 'sell' as const : 'buy' as const,
                    tradeQuantity: quantity,
                    tradeGrossAmount: grossAmount,
                    tradeFeeRate: feeRate,
                    tradeFeeAmount: feeAmount,
                    tradeAllocations: type === 'income' ? sellAllocations.map(({ buyTransactionId, quantity }) => ({ buyTransactionId, quantity })) : undefined,
                    tradeKeys: isCardKeyBuy ? preparedTradeKeys : undefined,
                    tradeKeyAllocations: isCardKeySell ? selectedTradeKeyAllocations : undefined,
                } : {
                    tradeAction: undefined,
                    tradeQuantity: undefined,
                    tradeGrossAmount: undefined,
                    tradeFeeRate: undefined,
                    tradeFeeAmount: undefined,
                    tradeAllocations: undefined,
                    tradeKeys: undefined,
                    tradeKeyAllocations: undefined,
                }),
                date: date.getTime(),
                note,
                attachments: finalKeys,
            };

            if (initialTransaction?.id) {
                await updateTransaction({
                    ...initialTransaction,
                    ...txData,
                    id: initialTransaction.id,
                    updatedAt: Date.now(),
                    createdAt: initialTransaction.createdAt || Date.now(),
                    isDeleted: initialTransaction.isDeleted,
                } as Transaction);
            } else {
                await addTransaction({
                    ...txData,
                    id: generateId(),
                    createdAt: Date.now(),
                    isDeleted: false,
                });
            }

            setAmountStr('0');
            setQuantityStr('1');
            setFeeRateStr('0');
            setSellAllocationInputs({});
            setTradeKeyInputs([]);
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
    const requestedCardKeySellQuantity = isCardKeyCategory && type === 'income'
        ? normalizeCardKeyQuantity(quantityStr)
        : 0;
    const selectedTradeKeyAllocations = useMemo<TradeKeyAllocation[]>(() => {
        if (!isCardKeyCategory || type !== 'income' || !selectedCategoryId || requestedCardKeySellQuantity <= 0) return [];
        if (cardKeySellMode === 'batch') {
            return cardKeyBatchOptions.flatMap(option => {
                const count = Math.min(
                    option.remainingKeys.length,
                    Math.max(0, Math.floor(Number(cardKeyBatchInputs[option.buyTransactionId] || 0)))
                );
                return option.remainingKeys.slice(0, count).map(item => ({
                    buyTransactionId: item.buyTransactionId,
                    keyId: item.keyId,
                    value: item.value,
                }));
            });
        }
        return getSuggestedTradeKeyAllocations(
            state.transactions,
            effectiveLedgerId,
            selectedCategoryId,
            requestedCardKeySellQuantity,
            initialTransaction?.id
        );
    }, [isCardKeyCategory, type, selectedCategoryId, requestedCardKeySellQuantity, cardKeySellMode, cardKeyBatchOptions, cardKeyBatchInputs, state.transactions, effectiveLedgerId, initialTransaction?.id]);
    const selectedCardKeyBatchQuantity = selectedTradeKeyAllocations.length;
    const selectedSellAllocations = useMemo<TradeAllocation[]>(() => {
        if (!isTrading || type !== 'income') return [];
        if (isCardKeyCategory) return tradeKeyAllocationsToTradeAllocations(selectedTradeKeyAllocations) || [];
        return availableSellLots
            .map(lot => ({
                buyTransactionId: lot.buyTransactionId,
                quantity: roundMoney(Number(sellAllocationInputs[lot.buyTransactionId] || 0)),
            }))
            .filter(allocation => Number.isFinite(allocation.quantity) && allocation.quantity > 0);
    }, [isTrading, type, isCardKeyCategory, selectedTradeKeyAllocations, availableSellLots, sellAllocationInputs]);
    const sellAllocatedQuantity = selectedSellAllocations.reduce((sum, allocation) => roundMoney(sum + allocation.quantity), 0);
    const parsedQuantity = Number(quantityStr);
    const validTradeQuantity = isTrading && type === 'income'
        ? isCardKeyCategory ? selectedTradeKeyAllocations.length : sellAllocatedQuantity
        : Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 0;
    const tradeSubtotalAmount = isTrading && calculatedAmount !== null && validTradeQuantity > 0
        ? roundMoney(calculatedAmount * validTradeQuantity)
        : null;
    const parsedTradeFeeRate = feeRateStr.trim() === '' ? getCategoryFeeRate(selectedCategory, type) : Number(feeRateStr);
    const tradeFeeRate = isTrading && Number.isFinite(parsedTradeFeeRate) && parsedTradeFeeRate >= 0
        ? parsedTradeFeeRate
        : 0;
    const tradeFeeAmount = tradeSubtotalAmount !== null
        ? roundMoney(tradeSubtotalAmount * tradeFeeRate / 100)
        : 0;
    const tradeFinalAmount = tradeSubtotalAmount !== null
        ? Math.max(0, roundMoney(type === 'expense' ? tradeSubtotalAmount + tradeFeeAmount : tradeSubtotalAmount - tradeFeeAmount))
        : null;
    const tradeSellCost = useMemo(
        () => isTrading && type === 'income' && selectedCategoryId && validTradeQuantity > 0
            ? getTradingAllocationCost(state.transactions, effectiveLedgerId, selectedCategoryId, selectedSellAllocations, initialTransaction?.id)
            : null,
        [isTrading, type, selectedCategoryId, validTradeQuantity, selectedSellAllocations, state.transactions, effectiveLedgerId, initialTransaction?.id]
    );
    const tradeEstimatedProfit = tradeFinalAmount !== null && tradeSellCost && tradeSellCost.matchedQuantity >= validTradeQuantity
        ? roundMoney(tradeFinalAmount - tradeSellCost.cost)
        : null;
    const currentInventory = isTrading && type === 'income'
        ? isCardKeyCategory ? availableSellCardKeys.length : availableSellLots.reduce((sum, lot) => roundMoney(sum + lot.remainingQuantity), 0)
        : 0;
    const inputDateValue = useMemo(() => format(date, 'yyyy-MM-dd'), [date]);

    return (
        <div
            className={clsx(
                'fixed inset-0 z-[70] flex flex-col bg-ios-bg overflow-hidden w-full h-full',
                state.settings.enableAnimations && 'animate-slide-up',
                'transition-[padding] duration-300 ease-out'
            )}
            style={{ paddingBottom: keyboardHeight > 0 ? `${keyboardHeight}px` : '0px' }}
        >
            <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2 bg-ios-bg z-10 shrink-0">
                <button onClick={onClose} className="p-2 -ml-2 text-ios-subtext">取消</button>
                <div className="flex bg-gray-200 dark:bg-zinc-800 rounded-lg p-0.5">
                    <button
                        onClick={() => handleTypeSelect('expense')}
                        className={`px-6 py-1.5 rounded-md text-sm font-medium transition-all ${type === 'expense' ? 'bg-white dark:bg-zinc-700 shadow-sm text-ios-text' : 'text-ios-subtext'}`}
                    >
                        {isTrading ? '买入' : '支出'}
                    </button>
                    <button
                        onClick={() => handleTypeSelect('income')}
                        className={`px-6 py-1.5 rounded-md text-sm font-medium transition-all ${type === 'income' ? 'bg-white dark:bg-zinc-700 shadow-sm text-ios-text' : 'text-ios-subtext'}`}
                    >
                        {isTrading ? '卖出' : '收入'}
                    </button>
                </div>
                <div className="w-10" />
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar relative min-h-0" onClick={() => { if (isNoteFocused) setIsNoteFocused(false); }}>
                {isTrading && type === 'income' ? (
                    <div className="p-4 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-sm font-semibold text-ios-text truncate">
                                    {selectedCategory ? `${selectedCategory.name} ${isCardKeyCategory ? '可卖卡密' : '可卖批次'}` : '选择要卖出的类目'}
                                </div>
                                <div className="text-xs text-ios-subtext tabular-nums">
                                    已选 {isCardKeyCategory ? selectedTradeKeyAllocations.length : formatResultNumber(sellAllocatedQuantity)} / 可卖 {formatResultNumber(currentInventory)}
                                </div>
                            </div>
                            <button
                                onClick={() => setShowSellCategoryPicker(true)}
                                className="shrink-0 px-3 py-1.5 rounded-full bg-gray-200 dark:bg-zinc-800 text-xs font-medium text-ios-text active:scale-95"
                            >
                                更换类目
                            </button>
                        </div>

                        {!selectedCategoryId ? (
                            <button
                                onClick={() => setShowSellCategoryPicker(true)}
                                className="w-full h-20 rounded-xl border border-dashed border-ios-border text-sm text-ios-subtext flex items-center justify-center active:bg-gray-100 dark:active:bg-zinc-800"
                            >
                                先选择卖出类目
                            </button>
                        ) : isCardKeyCategory ? (
                            <div className="space-y-3">
                                <div className="rounded-xl border border-ios-border bg-white/80 dark:bg-zinc-900/80 p-3">
                                    <div className="flex items-center gap-3">
                                        <label className="text-xs text-ios-subtext shrink-0">卖出数量</label>
                                        <input
                                            type="text"
                                            inputMode="none"
                                            readOnly
                                            aria-label="卖出数量"
                                            value={quantityStr}
                                            onPointerDown={event => {
                                                event.preventDefault();
                                                activateKeypadField('quantity');
                                            }}
                                            onFocus={() => activateKeypadField('quantity')}
                                            className={clsx(
                                                'w-24 bg-gray-50 dark:bg-zinc-800 rounded-lg px-3 py-1.5 text-sm outline-none border text-ios-text tabular-nums',
                                                activeKeypadField === 'quantity' ? 'border-ios-primary ring-2 ring-ios-primary/15' : 'border-ios-border'
                                            )}
                                        />
                                        <select
                                            aria-label="选择卡密卖出方式"
                                            value={cardKeySellMode}
                                            onChange={event => {
                                                const nextMode = event.target.value as 'auto' | 'batch';
                                                setCardKeySellMode(nextMode);
                                                if (nextMode === 'batch') {
                                                    setLinkedCardKeyBatchInputs(buildCardKeyBatchInputsForQuantity(requestedCardKeySellQuantity));
                                                } else {
                                                    setCardKeyBatchInputs({});
                                                }
                                            }}
                                            className="min-w-0 flex-1 max-w-[11rem] bg-gray-50 dark:bg-zinc-800 rounded-lg px-2 py-1.5 text-xs outline-none border border-ios-border text-ios-subtext"
                                        >
                                            <option value="auto">自动选择</option>
                                            <option value="batch">
                                                {`按批次选择${cardKeySellMode === 'batch' ? ` ${selectedCardKeyBatchQuantity}/${requestedCardKeySellQuantity}` : ''}`}
                                            </option>
                                        </select>
                                    </div>
                                    {cardKeySellMode === 'batch' && (
                                        <div className="mt-3 rounded-xl border border-ios-border bg-gray-50/70 dark:bg-zinc-800/50 p-3 space-y-3">
                                            <div className="space-y-2">
                                                {cardKeyBatchOptions.map(option => {
                                                    const value = cardKeyBatchInputs[option.buyTransactionId] || '';
                                                    const buyQuantity = Number(option.transaction.tradeQuantity || 0);
                                                    return (
                                                        <div
                                                            key={option.buyTransactionId}
                                                            className={clsx(
                                                                'rounded-lg border px-3 py-2 transition-colors',
                                                                value ? 'border-ios-primary/40 bg-ios-primary/5' : 'border-ios-border bg-white dark:bg-zinc-900'
                                                            )}
                                                        >
                                                            <div className="flex items-center justify-between gap-3">
                                                                <div className="min-w-0">
                                                                    <div className="text-xs font-medium text-ios-text truncate">
                                                                        {option.transaction.note || '买入记录'}
                                                                    </div>
                                                                    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-ios-subtext">
                                                                        <span>{format(option.transaction.date, 'yyyy/MM/dd')}</span>
                                                                        {buyQuantity > 0 ? <span>买入 {formatResultNumber(buyQuantity)}</span> : null}
                                                                        <span>可选 {option.remainingKeys.length}</span>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-1 shrink-0">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => adjustCardKeyBatchInput(option.buyTransactionId, -1, option.remainingKeys.length)}
                                                                        className="w-7 h-7 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center text-ios-text active:scale-95"
                                                                    >
                                                                        <Icon name="Minus" className="w-3.5 h-3.5" />
                                                                    </button>
                                                                    <input
                                                                        type="number"
                                                                        min="0"
                                                                        step="1"
                                                                        max={option.remainingKeys.length}
                                                                        value={value}
                                                                        placeholder="0"
                                                                        onChange={event => updateCardKeyBatchInput(option.buyTransactionId, event.target.value, option.remainingKeys.length)}
                                                                        className="w-14 h-7 rounded-lg border border-ios-border bg-white dark:bg-zinc-800 text-center text-xs tabular-nums text-ios-text outline-none"
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => adjustCardKeyBatchInput(option.buyTransactionId, 1, option.remainingKeys.length)}
                                                                        className="w-7 h-7 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center text-ios-text active:scale-95"
                                                                    >
                                                                        <Icon name="Plus" className="w-3.5 h-3.5" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                    <div className="mt-3 flex items-center justify-between gap-2 text-xs text-ios-subtext">
                                        <span>已列出 {selectedTradeKeyAllocations.length} 个</span>
                                        <button
                                            type="button"
                                            disabled={selectedTradeKeyAllocations.length === 0}
                                            onClick={() => copyText(selectedTradeKeyAllocations.map(item => item.value).join('\n'), '已复制全部卡密')}
                                            className="px-3 py-1 rounded-full bg-ios-primary/10 text-ios-primary font-medium disabled:opacity-40"
                                        >
                                            复制全部
                                        </button>
                                    </div>
                                </div>

                                {availableSellCardKeys.length === 0 ? (
                                    <div className="h-24 rounded-xl bg-white/70 dark:bg-zinc-900/70 border border-ios-border flex flex-col items-center justify-center text-sm text-ios-subtext">
                                        <Icon name="PackageOpen" className="w-5 h-5 mb-2" />
                                        没有可卖卡密
                                    </div>
                                ) : selectedTradeKeyAllocations.length === 0 ? (
                                    <div className="h-20 rounded-xl border border-dashed border-ios-border text-sm text-ios-subtext flex items-center justify-center">
                                        {cardKeySellMode === 'batch' ? '展开后选择买入批次' : '输入卖出数量后自动列出卡密'}
                                    </div>
                                ) : (
                                    selectedTradeKeyAllocations.map((allocation, index) => (
                                        <div
                                            key={`${allocation.buyTransactionId}:${allocation.keyId}`}
                                            className="rounded-lg border border-ios-primary/40 bg-ios-primary/5 px-2.5 py-2 flex items-center gap-2"
                                        >
                                            <div className="w-6 h-6 rounded-full bg-ios-primary text-white text-[11px] font-semibold flex items-center justify-center shrink-0">
                                                {index + 1}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-[13px] leading-4 font-medium text-ios-text break-all">{allocation.value}</div>
                                                <div className="text-[10px] leading-3 text-ios-subtext mt-0.5 truncate">{getCardKeyBatchLabel(allocation.buyTransactionId)}</div>
                                            </div>
                                            <button
                                                type="button"
                                                aria-label="复制单个卡密"
                                                title="复制单个卡密"
                                                onClick={() => copyText(allocation.value)}
                                                className="h-7 px-2.5 rounded-full bg-white dark:bg-zinc-800 border border-ios-border text-ios-primary flex items-center justify-center gap-1 text-[11px] font-medium active:scale-95 shrink-0"
                                            >
                                                <Icon name="Copy" className="w-3 h-3" />
                                                <span>复制</span>
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        ) : availableSellLots.length === 0 ? (
                            <div className="h-24 rounded-xl bg-white/70 dark:bg-zinc-900/70 border border-ios-border flex flex-col items-center justify-center text-sm text-ios-subtext">
                                <Icon name="PackageOpen" className="w-5 h-5 mb-2" />
                                没有可卖的买入批次
                            </div>
                        ) : (
                            availableSellLots.map(lot => {
                                const value = sellAllocationInputs[lot.buyTransactionId] || '';
                                const buyQuantity = Number(lot.transaction.tradeQuantity || lot.originalQuantity || 0);
                                return (
                                    <div
                                        key={lot.buyTransactionId}
                                        className={clsx(
                                            'rounded-xl border p-3 transition-colors',
                                            value
                                                ? 'border-ios-primary/40 bg-ios-primary/5'
                                                : 'border-ios-border bg-white/80 dark:bg-zinc-900/80'
                                        )}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="text-sm font-medium text-ios-text truncate">
                                                    {lot.transaction.note || '买入记录'}
                                                </div>
                                                <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-ios-subtext">
                                                    <span>{format(lot.transaction.date, 'yyyy/MM/dd')}</span>
                                                    <span>买入 {formatResultNumber(buyQuantity)}</span>
                                                    <span>剩余 {formatResultNumber(lot.remainingQuantity)}</span>
                                                    <span>成本 {formatResultNumber(lot.totalUnitCost)}</span>
                                                    {lot.transaction.attachments?.length ? <span>有图片</span> : null}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-1 shrink-0">
                                                <button
                                                    onClick={() => adjustSellAllocationInput(lot.buyTransactionId, -1, lot.remainingQuantity)}
                                                    className="w-8 h-8 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center text-ios-text active:scale-95"
                                                >
                                                    <Icon name="Minus" className="w-4 h-4" />
                                                </button>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="1"
                                                    max={lot.remainingQuantity}
                                                    value={value}
                                                    placeholder="0"
                                                    onChange={event => updateSellAllocationInput(lot.buyTransactionId, event.target.value, lot.remainingQuantity)}
                                                    className="w-16 h-8 rounded-lg border border-ios-border bg-white dark:bg-zinc-800 text-center text-sm tabular-nums text-ios-text outline-none"
                                                />
                                                <button
                                                    onClick={() => adjustSellAllocationInput(lot.buyTransactionId, 1, lot.remainingQuantity)}
                                                    className="w-8 h-8 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center text-ios-text active:scale-95"
                                                >
                                                    <Icon name="Plus" className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                ) : (
                    <div className="grid gap-y-6 p-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                        {categories.map(cat => (
                            <button
                                key={cat.id}
                                onClick={() => handleCategorySelect(cat.id)}
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
                        {isCardKeyCategory && type === 'expense' && (
                            <div className="col-span-full rounded-2xl border border-ios-border bg-white/80 dark:bg-zinc-900/80 p-4 space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <div className="text-sm font-semibold text-ios-text">本次买入卡密</div>
                                        <div className="text-xs text-ios-subtext mt-0.5">数量变化会同步增减输入框</div>
                                    </div>
                                    <span className="text-xs text-ios-subtext tabular-nums">{tradeKeyInputs.length} 个</span>
                                </div>
                                <div className="space-y-2">
                                    {tradeKeyInputs.length === 0 ? (
                                        <div className="h-16 rounded-xl border border-dashed border-ios-border text-sm text-ios-subtext flex items-center justify-center">
                                            先输入买入数量
                                        </div>
                                    ) : tradeKeyInputs.map((item, index) => (
                                        <div key={item.id} className="flex items-center gap-2">
                                            <span className="w-7 h-7 rounded-full bg-ios-primary/10 text-ios-primary text-xs font-semibold flex items-center justify-center shrink-0">
                                                {index + 1}
                                            </span>
                                            <input
                                                type="text"
                                                value={item.value}
                                                onChange={event => updateTradeKeyInput(index, event.target.value)}
                                                placeholder={`卡密 ${index + 1}`}
                                                className="min-w-0 flex-1 bg-gray-50 dark:bg-zinc-800 rounded-xl px-3 py-2 text-sm outline-none border border-ios-border text-ios-text"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
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

                    <div
                        role="button"
                        tabIndex={0}
                        onClick={() => activateKeypadField('amount')}
                        onKeyDown={event => {
                            if (event.key === 'Enter' || event.key === ' ') activateKeypadField('amount');
                        }}
                        className={clsx(
                            'min-w-[35%] text-right rounded-xl px-2 py-1 transition-all',
                            activeKeypadField === 'amount' ? 'ring-2 ring-ios-primary/15' : ''
                        )}
                    >
                        {isTrading && (
                            <div className="text-xs text-ios-subtext">单价</div>
                        )}
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

                {isTrading && (
                    <div className="px-5 py-2 border-b border-ios-border bg-gray-50/60 dark:bg-zinc-900/60 space-y-2">
                        {type === 'expense' && (
                            <div className="flex items-center gap-3">
                                <label className="text-xs text-ios-subtext shrink-0">数量</label>
                                <input
                                    type="text"
                                    inputMode="none"
                                    readOnly
                                    aria-label="买入数量"
                                    value={quantityStr}
                                    onPointerDown={event => {
                                        event.preventDefault();
                                        activateKeypadField('quantity');
                                    }}
                                    onFocus={() => activateKeypadField('quantity')}
                                    className={clsx(
                                        'w-24 bg-white dark:bg-zinc-800 rounded-lg px-3 py-1.5 text-sm outline-none border text-ios-text tabular-nums',
                                        activeKeypadField === 'quantity' ? 'border-ios-primary ring-2 ring-ios-primary/15' : 'border-ios-border'
                                    )}
                                />
                                <div className="text-xs text-ios-subtext flex-1 text-right">
                                    买入后增加库存
                                </div>
                            </div>
                        )}
                        <div className="flex items-center justify-between text-xs text-ios-subtext">
                            <span>小计 {tradeSubtotalAmount !== null ? `${formatResultNumber(calculatedAmount ?? 0)} × ${formatResultNumber(validTradeQuantity)} = ${formatResultNumber(tradeSubtotalAmount)}` : '-'}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 text-xs text-ios-subtext">
                            {type === 'income' ? (
                                <div className="flex items-center gap-1 min-w-0">
                                    <span className="shrink-0">手续费</span>
                                    <input
                                        type="text"
                                        inputMode="none"
                                        readOnly
                                        aria-label="卖出手续费率"
                                        value={feeRateStr}
                                        onPointerDown={event => {
                                            event.preventDefault();
                                            activateKeypadField('feeRate');
                                        }}
                                        onFocus={() => activateKeypadField('feeRate')}
                                        className={clsx(
                                            'w-16 bg-white dark:bg-zinc-800 rounded-md px-2 py-1 text-xs outline-none border text-ios-text tabular-nums',
                                            activeKeypadField === 'feeRate' ? 'border-ios-primary ring-2 ring-ios-primary/15' : 'border-ios-border'
                                        )}
                                    />
                                    <span className="shrink-0">%：{formatResultNumber(tradeFeeAmount)}</span>
                                </div>
                            ) : (
                                <span>手续费 {tradeFeeRate}%：{formatResultNumber(tradeFeeAmount)}</span>
                            )}
                            <span className="font-medium text-ios-text">最终金额 {tradeFinalAmount !== null ? formatResultNumber(tradeFinalAmount) : '-'}</span>
                        </div>
                        {type === 'income' && (
                            <div className="flex items-center justify-between text-xs text-ios-subtext">
                                <span>成本 {tradeSellCost && tradeSellCost.matchedQuantity >= validTradeQuantity ? formatResultNumber(tradeSellCost.cost) : '-'}</span>
                                <span className={clsx(
                                    'font-semibold',
                                    tradeEstimatedProfit === null ? 'text-ios-subtext' :
                                        tradeEstimatedProfit > 0 ? 'text-green-500' :
                                            tradeEstimatedProfit < 0 ? 'text-red-500' : 'text-ios-text'
                                )}>
                                    预计利润 {tradeEstimatedProfit !== null ? formatResultNumber(tradeEstimatedProfit) : '-'}
                                </span>
                            </div>
                        )}
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

            {isTrading && type === 'income' && showSellCategoryPicker && (
                <div className="fixed inset-0 z-[85] bg-black/30 flex items-end" onClick={handleSellCategoryCancel}>
                    <div
                        className="w-full max-h-[70vh] overflow-y-auto no-scrollbar bg-white dark:bg-zinc-900 rounded-t-3xl shadow-2xl border-t border-white/10 p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]"
                        onClick={event => event.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <div className="text-base font-semibold text-ios-text">选择卖出类目</div>
                                <div className="text-xs text-ios-subtext mt-0.5">选择后只显示该类目有剩余的买入批次</div>
                            </div>
                            <button
                                onClick={handleSellCategoryCancel}
                                className="px-3 py-1.5 rounded-full bg-gray-100 dark:bg-zinc-800 text-xs font-medium text-ios-subtext active:scale-95"
                            >
                                取消
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            {categories.map(category => (
                                <button
                                    key={category.id}
                                    onClick={() => handleSellCategorySelect(category.id)}
                                    className={clsx(
                                        'flex items-center gap-3 rounded-xl border px-3 py-3 text-left active:scale-[0.99]',
                                        selectedCategoryId === category.id
                                            ? 'border-ios-primary bg-ios-primary/5'
                                            : 'border-ios-border bg-gray-50 dark:bg-zinc-800/70'
                                    )}
                                >
                                    <div className="w-9 h-9 rounded-full bg-ios-primary/10 text-ios-primary flex items-center justify-center shrink-0">
                                        <Icon name={category.icon} className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-sm font-medium text-ios-text truncate">{category.name}</div>
                                        <div className="text-[11px] text-ios-subtext">
                                            {(category.tradeItemType ?? 'normal') === 'cardKey' ? '卡密' : '普通'} · 卖出手续费 {category.sellFeeRate ?? 0}%
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

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
