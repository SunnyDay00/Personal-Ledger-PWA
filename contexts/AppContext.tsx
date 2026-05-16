import React, { createContext, useContext, useReducer, useEffect, ReactNode, useState, useRef, useCallback } from 'react';
import { AppState, AppAction, Transaction, Ledger, OperationLog, BackupLog, Category, CategoryGroup, AppSettings, SyncQueueItem, AuthSession } from '../types';
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS, INITIAL_LEDGERS } from '../constants';
import { UPDATE_LOGS } from '../changelog';
import { generateId, extractCategoriesFromCsv, formatCurrency, parseCsvToTransactions } from '../utils';
import { db, initAndMigrateDB, dbAPI, ensureStoresReady, createSyncQueueItem, markAllLocalDataForSync, queueCachedImagesForUpload } from '../services/db';
import { pushToCloud, pullFromCloud, getCloudVersion, D1PullResponse } from '../services/d1Sync';
import { login as authLogin, register as authRegister, logout as authLogout, getMe, AuthApiError } from '../services/auth';
import { SyncService } from '../services/sync';
import { feedback } from '../services/feedback';
import { imageService } from '../services/imageService';
import { normalizeAppSettings, normalizeBackupReminderDays } from '../services/settingsUtils';

const initialState: AppState = {
    ledgers: INITIAL_LEDGERS,
    transactions: [],
    categories: DEFAULT_CATEGORIES,
    categoryGroups: [],
    settings: DEFAULT_SETTINGS,
    currentLedgerId: INITIAL_LEDGERS[0].id,
    currentDate: Date.now(),
    timeRange: 'month',
    operationLogs: [],
    backupLogs: [],
    updateLogs: UPDATE_LOGS,
    syncStatus: 'idle',
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    pendingSyncCount: 0,
};

interface AppContextType {
    state: AppState;
    dispatch: React.Dispatch<AppAction>;
    addTransaction: (t: Transaction) => Promise<void>;
    updateTransaction: (t: Transaction) => Promise<void>;
    deleteTransaction: (id: string) => Promise<void>;
    batchDeleteTransactions: (ids: string[]) => Promise<void>;
    batchUpdateTransactions: (ids: string[], updates: Partial<Transaction>) => Promise<void>;
    undo: () => Promise<void>;
    canUndo: boolean;
    manualBackup: () => Promise<void>;
    manualCloudSync: () => Promise<void>;
    importData: (data: Partial<AppState>) => void;
    smartImportCsv: (csvContent: string, targetLedgerId?: string) => void;
    restoreFromCloud: () => Promise<void>;
    resetApp: () => Promise<void>;
    restoreFromD1: () => Promise<void>;
    addLedger: (ledger: Ledger) => Promise<void>;
    triggerCloudSync: () => void;
    loginAccount: (username: string, password: string) => Promise<AuthSession>;
    registerAccount: (username: string, password: string, inviteCode: string) => Promise<AuthSession>;
    logoutAccount: () => Promise<void>;
}

const AppContext = createContext<AppContextType>({
    state: initialState,
    dispatch: () => null,
    addTransaction: async () => { },
    updateTransaction: async () => { },
    deleteTransaction: async () => { },
    batchDeleteTransactions: async () => { },
    batchUpdateTransactions: async () => { },
    undo: async () => { },
    canUndo: false,
    manualBackup: async () => { },
    manualCloudSync: async () => { },
    importData: () => { },
    smartImportCsv: () => { },
    restoreFromCloud: async () => { },
    resetApp: async () => { },
    restoreFromD1: async () => { },
    addLedger: async () => { },
    triggerCloudSync: () => { },
    loginAccount: async () => { throw new Error('AppContext not ready'); },
    registerAccount: async () => { throw new Error('AppContext not ready'); },
    logoutAccount: async () => { },
});

function appReducer(state: AppState, action: AppAction): AppState {
    switch (action.type) {
        case 'SET_LEDGER':
            if (typeof window !== 'undefined') localStorage.setItem('lastLedgerId', action.payload);
            return { ...state, currentLedgerId: action.payload };
        case 'SET_CURRENT_DATE':
            return { ...state, currentDate: action.payload };
        case 'SET_TIME_RANGE':
            return { ...state, timeRange: action.payload };
        case 'ADD_TRANSACTION':
            return { ...state, transactions: [action.payload, ...state.transactions] };
        case 'UPDATE_TRANSACTION':
            return {
                ...state,
                transactions: state.transactions.map(t => t.id === action.payload.id ? action.payload : t)
            };
        case 'DELETE_TRANSACTION':
            return { ...state, transactions: state.transactions.filter(t => t.id !== action.payload) };
        case 'BATCH_DELETE_TRANSACTIONS':
            return { ...state, transactions: state.transactions.filter(t => !action.payload.includes(t.id)) };
        case 'BATCH_UPDATE_TRANSACTIONS':
            const { ids, updates } = action.payload;
            return {
                ...state,
                transactions: state.transactions.map(t =>
                    ids.includes(t.id) ? { ...t, ...updates, updatedAt: updates.updatedAt ?? Date.now() } : t
                )
            };
        case 'RESTORE_TRANSACTION':
            return { ...state, transactions: [action.payload, ...state.transactions] };
        case 'ADD_LEDGER':
            return { ...state, ledgers: [...state.ledgers, action.payload] };
        case 'UPDATE_LEDGER':
            return { ...state, ledgers: state.ledgers.map(l => l.id === action.payload.id ? action.payload : l) };
        case 'DELETE_LEDGER': {
            const newLedgers = state.ledgers.filter(l => l.id !== action.payload);
            const newTxs = state.transactions.filter(t => t.ledgerId !== action.payload);
            const nextLedgerId = state.currentLedgerId === action.payload ? (newLedgers[0]?.id || '') : state.currentLedgerId;
            if (typeof window !== 'undefined') localStorage.setItem('lastLedgerId', nextLedgerId);
            return {
                ...state,
                ledgers: newLedgers,
                transactions: newTxs,
                currentLedgerId: nextLedgerId
            };
        }
        case 'UPDATE_SETTINGS':
            return { ...state, settings: normalizeAppSettings({ ...state.settings, ...action.payload }, DEFAULT_SETTINGS) };
        case 'ADD_OPERATION_LOG':
            return { ...state, operationLogs: [action.payload, ...state.operationLogs] };
        case 'ADD_BACKUP_LOG':
            return { ...state, backupLogs: [action.payload, ...state.backupLogs] };
        case 'SET_SYNC_STATUS':
            return { ...state, syncStatus: action.payload };
        case 'SET_ONLINE_STATUS':
            return { ...state, isOnline: action.payload };
        case 'SET_PENDING_SYNC_COUNT':
            return { ...state, pendingSyncCount: action.payload };
        case 'SET_LAST_SYNC_ERROR':
            return { ...state, lastSyncError: action.payload };
        case 'RESTORE_DATA':
            const newSettings = normalizeAppSettings({ ...state.settings, ...(action.payload.settings || {}) }, DEFAULT_SETTINGS);
            return {
                ...state,
                ...action.payload,
                categoryGroups: action.payload.categoryGroups ?? state.categoryGroups,
                settings: newSettings
            };
        case 'SET_THEME_MODE':
            return { ...state, settings: { ...state.settings, themeMode: action.payload } };
        case 'ADD_SEARCH_HISTORY':
            const newHistory = [action.payload, ...state.settings.searchHistory.filter(h => h !== action.payload)].slice(0, 10);
            return { ...state, settings: { ...state.settings, searchHistory: newHistory } };
        case 'CLEAR_SEARCH_HISTORY':
            return { ...state, settings: { ...state.settings, searchHistory: [] } };
        case 'COMPLETE_ONBOARDING':
            return { ...state, settings: { ...state.settings, isFirstRun: false } };
        case 'ADD_CATEGORY':
            return { ...state, categories: [...state.categories, { ...action.payload, ledgerId: action.payload.ledgerId || state.currentLedgerId }] };
        case 'UPDATE_CATEGORY':
            return { ...state, categories: state.categories.map(c => c.id === action.payload.id ? action.payload : c) };
        case 'DELETE_CATEGORY':
            return { ...state, categories: state.categories.filter(c => c.id !== action.payload) };
        case 'REORDER_CATEGORIES':
            if (action.payload.length === 0) return state;
            const reorderedMap = new Map(action.payload.map(category => [category.id, category]));
            return {
                ...state,
                categories: state.categories.map(category => reorderedMap.get(category.id) ?? category)
            };
        case 'ADD_CATEGORY_GROUP':
            return { ...state, categoryGroups: [...state.categoryGroups, { ...action.payload, ledgerId: action.payload.ledgerId || state.currentLedgerId }] };
        case 'UPDATE_CATEGORY_GROUP':
            return { ...state, categoryGroups: state.categoryGroups.map(g => g.id === action.payload.id ? action.payload : g) };
        case 'DELETE_CATEGORY_GROUP':
            return { ...state, categoryGroups: state.categoryGroups.filter(g => g.id !== action.payload) };
        case 'REORDER_CATEGORY_GROUPS':
            return { ...state, categoryGroups: action.payload };
        case 'SAVE_NOTE_HISTORY': {
            const { categoryId, note } = action.payload;
            if (!note || !note.trim()) return state;
            const notesMap = state.settings.categoryNotes || {};
            const currentNotes = notesMap[categoryId] || [];
            const newNotes = [note, ...currentNotes.filter(n => n !== note)].slice(0, 10);
            return {
                ...state,
                settings: { ...state.settings, categoryNotes: { ...notesMap, [categoryId]: newNotes } }
            };
        }
        default:
            return state;
    }
}

const isUnauthorizedError = (error: unknown) => error instanceof AuthApiError && error.status === 401;

const hasPulledRows = (payload: D1PullResponse) =>
    (payload.ledgers?.length || 0) +
    (payload.categories?.length || 0) +
    (payload.groups?.length || 0) +
    (payload.transactions?.length || 0) +
    (payload.settings ? 1 : 0) > 0;

const countLocalDataRecords = async () => {
    const [ledgers, categories, groups, transactions] = await Promise.all([
        db.ledgers.count(),
        db.categories.count(),
        db.categoryGroups.count().catch(() => 0),
        db.transactions.count(),
    ]);
    return ledgers + categories + groups + transactions;
};

const withoutLocalAuthSecrets = (settings: AppSettings): Partial<AppSettings> => {
    const syncable = { ...(settings as AppSettings & Record<string, unknown>) };
    [
        'authSession',
        'authMode',
        'cfConfig',
        'syncEndpoint',
        'syncToken',
        'syncUserId',
        'legacySyncEndpoint',
        'legacySyncToken',
        'legacySyncUserId',
        'legacyCloudMigratedToUserId',
        'legacyLocalMigratedToUserId',
    ].forEach(key => delete syncable[key]);
    return syncable as Partial<AppSettings>;
};

const restoreStoredAuthSettings = (settings: AppSettings): AppSettings => {
    const session = settings.authSession;
    if (!session?.token || session.expiresAt <= Date.now()) {
        return normalizeAppSettings({ ...settings, authSession: undefined, authMode: 'guest' }, DEFAULT_SETTINGS);
    }

    return normalizeAppSettings({ ...settings, authMode: 'authenticated' }, DEFAULT_SETTINGS);
};

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [state, dispatch] = useReducer(appReducer, initialState);
    const [isDBLoaded, setIsDBLoaded] = useState(false);
    const [dbInitError, setDbInitError] = useState<string | null>(null);
    const [syncDirty, setSyncDirty] = useState(false);
    const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isRestoringRef = useRef(false); // Guard against auto-sync immediately after restore
    const accountTakeoverRunningRef = useRef(false);
    const [isRestoring, setIsRestoring] = useState(false);
    const versionCheckTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const versionCheckDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const versionVisibilityDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const versionCheckRunningRef = useRef(false);
    const authValidationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const validatedAuthTokenRef = useRef<string | null>(null);
    const autoBackupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const autoBackupRunningRef = useRef(false);
    const autoBackupRef = useRef(false);
    // 默认认为不存在，检测成功后再置为 true，避免首次恢复访问不存在的 store
    const groupStoreAvailableRef = useRef(false);

    const refreshPendingSyncCount = useCallback(async () => {
        try {
            const count = await dbAPI.getPendingSyncCount();
            dispatch({ type: 'SET_PENDING_SYNC_COUNT', payload: count });
            return count;
        } catch (e) {
            console.warn('Failed to refresh pending sync count', e);
            return 0;
        }
    }, []);

    // Sync settings to FeedbackService
    useEffect(() => {
        const sound = (state.settings as any).enableSound ?? true;
        const haptics = (state.settings as any).enableHaptics ?? true;
        feedback.updateSettings(sound, haptics);
    }, [(state.settings as any).enableSound, (state.settings as any).enableHaptics]);

    // Initialize DB and Load State
    useEffect(() => {
        const init = async (retry = false) => {
            try {
                const ok = await ensureStoresReady();
                if (!ok) {
                    throw new Error('本地数据库结构异常，已停止初始化以保护本地数据');
                }
                await initAndMigrateDB();

                // detect categoryGroups store availability
                try {
                    await db.categoryGroups.count();
                    groupStoreAvailableRef.current = true;
                } catch {
                    groupStoreAvailableRef.current = false;
                }

                // Load data from DB to Memory for UI (ViewModel)
                const [settings, ledgers, categories, transactions, operationLogs, backupLogs, groups] = await Promise.all([
                    dbAPI.getSettings(),
                    dbAPI.getLedgers(),
                    dbAPI.getCategories(),
                    dbAPI.getTransactions(),
                    dbAPI.getOperationLogs(),
                    dbAPI.getBackupLogs(),
                    groupStoreAvailableRef.current ? dbAPI.getCategoryGroups() : Promise.resolve([])
                ]);

                const loadedSettings = restoreStoredAuthSettings(normalizeAppSettings(settings, DEFAULT_SETTINGS));
                if (loadedSettings.enableCloudSync === undefined) loadedSettings.enableCloudSync = false;

                const lastLedgerId = typeof window !== 'undefined' ? localStorage.getItem('lastLedgerId') : null;

                // Determine target ledger (prefer last used, otherwise first available)
                const targetLedgerId = lastLedgerId && ledgers.some(l => l.id === lastLedgerId)
                    ? lastLedgerId
                    : (ledgers[0]?.id || '');

                const initialLedgerId = targetLedgerId;

                // If no settings found, save default settings to ensure persistence on first run
                if (!settings) {
                    await db.settings.put({ key: 'main', value: loadedSettings });
                } else {
                    const serializedLoaded = JSON.stringify(loadedSettings);
                    const serializedStored = JSON.stringify(settings);
                    if (serializedLoaded !== serializedStored) {
                        await db.settings.put({ key: 'main', value: loadedSettings });
                    }
                }

                const newState: Partial<AppState> = {
                    settings: loadedSettings,
                    ledgers: ledgers || [],
                    categories: categories || [],
                    categoryGroups: groups || [],
                    transactions: transactions || [],
                    operationLogs: operationLogs || [],
                    backupLogs: backupLogs || [],
                    currentLedgerId: initialLedgerId,
                    syncStatus: 'idle',
                    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true
                };

                dispatch({ type: 'RESTORE_DATA', payload: newState });
                const pendingCount = await refreshPendingSyncCount();
                if (pendingCount > 0) setSyncDirty(true);
                setIsDBLoaded(true);
                setDbInitError(null);
                await reloadGroupsToState();
            } catch (e: any) {
                console.error('Init failed', e);
                const message = e?.message || '本地数据库初始化失败';
                setDbInitError(message);
                dispatch({ type: 'SET_LAST_SYNC_ERROR', payload: message });
            }
        };
        init();
    }, [refreshPendingSyncCount]);

    // Persist Changes to DB (Write-Behind / Side-Effects)
    // We use this useEffect to save Settings whenever they change
    const prevSettingsRef = useRef<string | null>(null);
    useEffect(() => {
        if (isDBLoaded) {
            dbAPI.saveSettings(state.settings);
            // Trigger sync when settings change (excluding lastSyncVersion to prevent infinite loop)
            const settingsWithoutVersion = { ...state.settings, lastSyncVersion: undefined };
            const currentHash = JSON.stringify(settingsWithoutVersion);
            if (prevSettingsRef.current !== null && prevSettingsRef.current !== currentHash) {
                setSyncDirty(true);
            }
            prevSettingsRef.current = currentHash;
        }
    }, [state.settings, isDBLoaded]);

    const [undoStack, setUndoStack] = useState<{ type: 'restore_delete'; data: Transaction } | { type: 'restore_batch'; data: Transaction[] } | null>(null);

    const stateRef = useRef(state);
    useEffect(() => { stateRef.current = state; }, [state]);

    const getActiveAuthSession = () => {
        const settings = stateRef.current.settings;
        return settings.authMode === 'authenticated' && settings.authSession?.token
            ? settings.authSession
            : undefined;
    };

    const persistAuthSettings = useCallback(async (payload: Partial<AppSettings>) => {
        const stored = await dbAPI.getSettings().catch(() => undefined);
        const base = normalizeAppSettings({ ...stateRef.current.settings, ...(stored || {}) }, DEFAULT_SETTINGS);
        const next = normalizeAppSettings({ ...base, ...payload }, DEFAULT_SETTINGS);
        stateRef.current = { ...stateRef.current, settings: next };
        dispatch({ type: 'UPDATE_SETTINGS', payload: next });
        await dbAPI.saveSettings(next);
    }, []);

    const clearAuthSession = useCallback(async () => {
        if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
        if (versionCheckTimerRef.current) clearInterval(versionCheckTimerRef.current);
        if (versionCheckDelayTimerRef.current) clearTimeout(versionCheckDelayTimerRef.current);
        if (versionVisibilityDebounceRef.current) clearTimeout(versionVisibilityDebounceRef.current);
        if (authValidationTimerRef.current) clearTimeout(authValidationTimerRef.current);
        validatedAuthTokenRef.current = null;
        await persistAuthSettings({
            authSession: undefined,
            authMode: 'guest',
        });
    }, [persistAuthSettings]);

    useEffect(() => {
        if (!isDBLoaded) return;

        const session = state.settings.authSession;
        if (state.settings.authMode !== 'authenticated' || !session?.token) {
            validatedAuthTokenRef.current = null;
            return;
        }

        if (validatedAuthTokenRef.current === session.token) return;
        if (authValidationTimerRef.current) clearTimeout(authValidationTimerRef.current);

        authValidationTimerRef.current = setTimeout(async () => {
            try {
                const me = await getMe(session.token);
                validatedAuthTokenRef.current = session.token;

                const current = stateRef.current.settings.authSession;
                if (current?.token !== session.token) return;

                if (current.user.id !== me.user.id || current.user.username !== me.user.username || current.expiresAt !== me.expiresAt) {
                    await persistAuthSettings({
                        authSession: {
                            user: me.user,
                            token: session.token,
                            expiresAt: me.expiresAt,
                        },
                        authMode: 'authenticated',
                    });
                }
            } catch (e) {
                if (isUnauthorizedError(e)) {
                    await clearAuthSession();
                    dispatch({ type: 'SET_LAST_SYNC_ERROR', payload: '登录已失效，请重新登录' });
                    return;
                }
                console.warn('Background auth validation skipped', e);
            }
        }, 3000);

        return () => {
            if (authValidationTimerRef.current) clearTimeout(authValidationTimerRef.current);
        };
    }, [isDBLoaded, state.settings.authMode, state.settings.authSession?.token, clearAuthSession, persistAuthSettings]);

    // 便于在浏览器 Console 调试：window.__state
    useEffect(() => {
        if (typeof window !== 'undefined') (window as any).__state = stateRef;
    }, []);

    // 如果 DB 中已有分组而 state 为空，自动同步到内存；同时暴露 state 便于调试
    useEffect(() => {
        if (typeof window !== 'undefined') (window as any).__state = stateRef;
        const syncGroupsToState = async () => {
            if (!isDBLoaded) return;
            try {
                const groups = await dbAPI.getCategoryGroups();
                if (groups.length > 0 && stateRef.current.categoryGroups.length === 0) {
                    dispatch({ type: 'RESTORE_DATA', payload: { categoryGroups: groups } });
                }
            } catch { }

            // Clean up image cache periodically (on startup)
            setTimeout(() => {
                imageService.enforceCacheLimit().catch(e => console.warn('Cache cleanup failed', e));
            }, 10000);
        };
        syncGroupsToState();
    }, [isDBLoaded]);

    // Online/Offline Listeners
    useEffect(() => {
        const handleOnline = () => {
            dispatch({ type: 'SET_ONLINE_STATUS', payload: true });
            setSyncDirty(true);
        };
        const handleOffline = () => dispatch({ type: 'SET_ONLINE_STATUS', payload: false });
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Audio Warm-up for PWA (Persistent for iOS)
        const handleInteraction = () => {
            console.log('[AppContext] User interaction detected, resuming audio context...');
            feedback.resumeContext();
        };

        const handleVisibilityChange = () => {
            console.log('[AppContext] Visibility changed:', document.visibilityState);
            if (document.visibilityState === 'hidden') {
                // Do NOT reset audio context on background. 
                // Letting it suspend and then "kicking" it with unlockAudio() on resume is more reliable
                // and avoids race conditions during quick re-opens.
            }
            // On visible, do NOTHING. Wait for user interaction (touchstart) to resume.
            if (document.visibilityState === 'visible') {
                setSyncDirty(true);
            }
        };

        // iOS requires user interaction to unlock audio context
        // We use touchend/click as they are more reliable for audio resumption than touchstart
        window.addEventListener('touchend', handleInteraction, { passive: false });
        window.addEventListener('click', handleInteraction, { passive: true });
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('touchend', handleInteraction);
            window.removeEventListener('click', handleInteraction);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    // Theme
    useEffect(() => {
        const root = window.document.documentElement;
        const isDark = state.settings.themeMode === 'dark' || (state.settings.themeMode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        if (isDark) root.classList.add('dark');
        else root.classList.remove('dark');
        const currentLedger = state.ledgers.find(l => l.id === state.currentLedgerId);
        if (currentLedger) {
            root.style.setProperty('--color-primary', state.settings.customThemeColor || currentLedger.themeColor);
        }
    }, [state.settings.themeMode, state.currentLedgerId, state.ledgers, state.settings.customThemeColor]);

    // Backup reminder（仅提示一次）
    const hasRemindedRef = useRef(false);
    useEffect(() => {
        if (!isDBLoaded || hasRemindedRef.current) return;
        const { lastBackupTime, webdavUrl, webdavUser, webdavPass, backupReminderDays } = state.settings;
        const hasWebdav = !!(webdavUrl && webdavUser && webdavPass);
        const thresholdDays = normalizeBackupReminderDays(backupReminderDays, DEFAULT_SETTINGS.backupReminderDays ?? 7);
        // 仅在已配置 WebDAV 且存在有效的上次备份时间且开启提醒时提示
        if (!hasWebdav || !lastBackupTime || thresholdDays <= 0) return;
        const days = (Date.now() - lastBackupTime) / (1000 * 60 * 60 * 24);
        if (days > thresholdDays) {
            alert(`建议手动备份：距离上次备份已超过 ${thresholdDays} 天`);
            hasRemindedRef.current = true;
        }
    }, [isDBLoaded, state.settings.lastBackupTime, state.settings.webdavUrl, state.settings.webdavUser, state.settings.webdavPass, state.settings.backupReminderDays]);

    const nextMutationTime = () => Math.max(Date.now(), (stateRef.current.settings.lastSyncVersion || 0) + 1);

    const persistTransactionWithQueue = async (tx: Transaction, operation: 'upsert' | 'delete') => {
        const queued = createSyncQueueItem('transaction', tx.id, operation, tx.updatedAt || nextMutationTime());
        await (db as any).transaction('rw', db.transactions, db.syncQueue, async () => {
            await db.transactions.put(tx);
            await db.syncQueue.put(queued);
        });
        await refreshPendingSyncCount();
    };

    const persistTransactionsWithQueue = async (txs: Transaction[], operation: 'upsert' | 'delete') => {
        if (txs.length === 0) return;
        const queueItems = txs.map(tx => createSyncQueueItem('transaction', tx.id, operation, tx.updatedAt || nextMutationTime()));
        await (db as any).transaction('rw', db.transactions, db.syncQueue, async () => {
            await db.transactions.bulkPut(txs);
            await db.syncQueue.bulkPut(queueItems);
        });
        await refreshPendingSyncCount();
    };


    // ================= ACTIONS (DB + State) =================

    const addTransaction = async (t: Transaction) => {
        const now = nextMutationTime();
        const saved: Transaction = { ...t, updatedAt: now, isDeleted: false };
        await persistTransactionWithQueue(saved, 'upsert');
        dispatch({ type: 'ADD_TRANSACTION', payload: saved });

        if (saved.note) dispatch({ type: 'SAVE_NOTE_HISTORY', payload: { categoryId: saved.categoryId, note: saved.note } });
        logOperation('add', saved.id, 'Add ' + (saved.type === 'expense' ? 'expense ' : 'income ') + saved.amount);
        dispatch({ type: 'SET_LAST_SYNC_ERROR', payload: undefined });
        setSyncDirty(true);
    };

    const updateTransaction = async (t: Transaction) => {
        const now = nextMutationTime();
        const saved: Transaction = { ...t, updatedAt: now, isDeleted: false };
        await persistTransactionWithQueue(saved, 'upsert');
        dispatch({ type: 'UPDATE_TRANSACTION', payload: saved });

        if (saved.note) dispatch({ type: 'SAVE_NOTE_HISTORY', payload: { categoryId: saved.categoryId, note: saved.note } });
        logOperation('edit', saved.id, 'Update amount ' + saved.amount);
        dispatch({ type: 'SET_LAST_SYNC_ERROR', payload: undefined });
        setSyncDirty(true);
    };

    const deleteTransaction = async (id: string) => {
        const target = stateRef.current.transactions.find(t => t.id === id);
        if (!target) return;

        const now = nextMutationTime();
        const deleted: Transaction = { ...target, isDeleted: true, updatedAt: now };
        await persistTransactionWithQueue(deleted, 'delete');

        dispatch({ type: 'DELETE_TRANSACTION', payload: id });
        logOperation('delete', id, 'Delete ' + target.amount);
        setUndoStack({ type: 'restore_delete', data: target });
        dispatch({ type: 'SET_LAST_SYNC_ERROR', payload: undefined });
        setSyncDirty(true);
    };

    const undo = async () => {
        if (!undoStack) return;
        const now = nextMutationTime();
        if (undoStack.type === 'restore_delete') {
            const restored: Transaction = { ...undoStack.data, isDeleted: false, updatedAt: now };
            await persistTransactionWithQueue(restored, 'upsert');
            dispatch({ type: 'RESTORE_TRANSACTION', payload: restored });
            logOperation('restore', restored.id, '撤回删除');
        } else if (undoStack.type === 'restore_batch') {
            const restoredList: Transaction[] = undoStack.data.map(t => ({ ...t, isDeleted: false, updatedAt: now }));
            await persistTransactionsWithQueue(restoredList, 'upsert');
            restoredList.forEach(r => dispatch({ type: 'RESTORE_TRANSACTION', payload: r }));
            logOperation('restore', 'batch', `撤回批量删除 ${restoredList.length} 条`);
        }
        setUndoStack(null);
        dispatch({ type: 'SET_LAST_SYNC_ERROR', payload: undefined });
        setSyncDirty(true);
    };

    // Wrapper for dispatching category/ledger actions to also sync to DB
    const originalDispatch = dispatch;
    const enhancedDispatch: React.Dispatch<AppAction> = (action) => {
        originalDispatch(action);
        const markDirtyTypes: AppAction['type'][] = [
            'ADD_LEDGER', 'UPDATE_LEDGER', 'DELETE_LEDGER',
            'ADD_CATEGORY', 'UPDATE_CATEGORY', 'DELETE_CATEGORY', 'REORDER_CATEGORIES',
            'ADD_CATEGORY_GROUP', 'UPDATE_CATEGORY_GROUP', 'DELETE_CATEGORY_GROUP', 'REORDER_CATEGORY_GROUPS',
            'UPDATE_SETTINGS', 'BATCH_DELETE_TRANSACTIONS', 'BATCH_UPDATE_TRANSACTIONS'
        ];

        // Robust timestamp to prevent clock skew issues
        const now = Math.max(Date.now(), (state.settings.lastSyncVersion || 0) + 1);

        // Handle DB writes for non-transaction entities
        switch (action.type) {
            case 'ADD_LEDGER':
                db.ledgers.put({ ...action.payload, updatedAt: now, isDeleted: false });
                logOperation('add', action.payload.id, `新增账本：${action.payload.name}`);
                break;
            case 'UPDATE_LEDGER': {
                const previousLedger = state.ledgers.find(ledger => ledger.id === action.payload.id);
                db.ledgers.put({ ...action.payload, updatedAt: now });
                logOperation('edit', action.payload.id, `编辑账本：${previousLedger?.name || action.payload.name}`);
                break;
            }
            case 'DELETE_LEDGER': {
                const targetLedger = state.ledgers.find(ledger => ledger.id === action.payload);
                db.ledgers.update(action.payload, { isDeleted: true, updatedAt: now });
                // Also soft delete txs
                db.transactions.where('ledgerId').equals(action.payload).modify({ isDeleted: true, updatedAt: now });
                logOperation('delete', action.payload, `删除账本：${targetLedger?.name || action.payload}`);
                setSyncDirty(true);
                break;
            }
            case 'ADD_CATEGORY':
                db.categories.put({ ...action.payload, ledgerId: action.payload.ledgerId || state.currentLedgerId, updatedAt: now, isDeleted: false });
                logOperation('add', action.payload.id, `新增${action.payload.type === 'income' ? '收入' : '支出'}分类：${action.payload.name}`);
                break;
            case 'UPDATE_CATEGORY': {
                const previousCategory = state.categories.find(category => category.id === action.payload.id);
                db.categories.put({ ...action.payload, updatedAt: now });
                logOperation('edit', action.payload.id, `编辑分类：${previousCategory?.name || action.payload.name}`);
                break;
            }
            case 'UPDATE_SETTINGS': // Note: Settings handled by useEffect, but could be here too
                break;
            case 'DELETE_CATEGORY': {
                const targetCategory = state.categories.find(category => category.id === action.payload);
                db.categories.update(action.payload, { isDeleted: true, updatedAt: now });
                logOperation('delete', action.payload, `删除分类：${targetCategory?.name || action.payload}`);
                break;
            }
            case 'REORDER_CATEGORIES': {
                const typeLabel = action.payload[0]?.type === 'income' ? '收入' : '支出';
                db.categories.bulkPut(action.payload.map(c => ({ ...c, updatedAt: now })));
                logOperation('edit', `category-order:${action.payload[0]?.ledgerId || state.currentLedgerId}:${action.payload[0]?.type || 'expense'}`, `调整${typeLabel}分类排序，共 ${action.payload.length} 项`);
                break;
            }
            case 'ADD_CATEGORY_GROUP':
                db.categoryGroups.put({ ...action.payload, ledgerId: action.payload.ledgerId || state.currentLedgerId, updatedAt: now, isDeleted: false });
                logOperation('add', action.payload.id, `新增分类组：${action.payload.name}`);
                break;
            case 'UPDATE_CATEGORY_GROUP':
                db.categoryGroups.put({ ...action.payload, updatedAt: now, isDeleted: false });
                logOperation('edit', action.payload.id, `编辑分类组：${action.payload.name}`);
                break;
            case 'DELETE_CATEGORY_GROUP': {
                const targetGroup = state.categoryGroups.find(group => group.id === action.payload);
                db.categoryGroups.update(action.payload, { isDeleted: true, updatedAt: now });
                logOperation('delete', action.payload, `删除分类组：${targetGroup?.name || action.payload}`);
                break;
            }
            case 'REORDER_CATEGORY_GROUPS':
                db.categoryGroups.bulkPut(action.payload.map(g => ({ ...g, updatedAt: now })));
                logOperation('edit', `category-group-order:${state.currentLedgerId}`, `调整分类组排序，共 ${action.payload.length} 项`);
                break;
            case 'BATCH_DELETE_TRANSACTIONS':
                db.transactions.where('id').anyOf(action.payload).modify(t => { t.isDeleted = true; t.updatedAt = now; });
                break;
            case 'BATCH_UPDATE_TRANSACTIONS': {
                const { ids, updates } = action.payload;
                const persistedUpdates: Partial<Transaction> = {};
                (Object.entries(updates) as [keyof Transaction, any][]).forEach(([key, value]) => {
                    if (value !== undefined) (persistedUpdates as any)[key] = value;
                });
                db.transactions.where('id').anyOf(ids).modify(t => {
                    Object.assign(t, persistedUpdates);
                    t.updatedAt = now;
                    t.isDeleted = false;
                });
                break;
            }
            case 'ADD_BACKUP_LOG':
                db.backupLogs.put(action.payload);
                break;
        }
        if (markDirtyTypes.includes(action.type)) setSyncDirty(true);
    };

    const batchDeleteTransactions = async (ids: string[]) => {
        if (!ids || ids.length === 0) return;
        const deletedTxs = stateRef.current.transactions.filter(t => ids.includes(t.id));
        const now = nextMutationTime();
        const deletedForDb = deletedTxs.map(t => ({ ...t, isDeleted: true, updatedAt: now }));
        await persistTransactionsWithQueue(deletedForDb, 'delete');
        dispatch({ type: 'BATCH_DELETE_TRANSACTIONS', payload: ids });
        setUndoStack({ type: 'restore_batch', data: deletedTxs });
        logOperation('delete', 'batch', '批量删除 ' + ids.length + ' 条');
        dispatch({ type: 'SET_LAST_SYNC_ERROR', payload: undefined });
        setSyncDirty(true);
    };

    const batchUpdateTransactions = async (ids: string[], updates: Partial<Transaction>) => {
        if (!ids || ids.length === 0) return;
        if (!updates || Object.keys(updates).length === 0) return;
        const now = nextMutationTime();
        const persistedUpdates: Partial<Transaction> = {};
        (Object.entries(updates) as [keyof Transaction, any][]).forEach(([key, value]) => {
            if (value !== undefined) (persistedUpdates as any)[key] = value;
        });
        const updatedTxs = stateRef.current.transactions
            .filter(t => ids.includes(t.id))
            .map(t => ({ ...t, ...persistedUpdates, updatedAt: now, isDeleted: false }));

        await persistTransactionsWithQueue(updatedTxs, 'upsert');
        dispatch({ type: 'BATCH_UPDATE_TRANSACTIONS', payload: { ids, updates: { ...persistedUpdates, updatedAt: now, isDeleted: false } } });
        const noteToSave = updates.note;
        const categoryForNote = updates.categoryId || stateRef.current.transactions.find(t => ids.includes(t.id))?.categoryId;
        if (noteToSave && categoryForNote) {
            dispatch({ type: 'SAVE_NOTE_HISTORY', payload: { categoryId: categoryForNote, note: noteToSave } });
        }
        logOperation('edit', 'batch', 'Batch update ' + ids.length + ' items');
        dispatch({ type: 'SET_LAST_SYNC_ERROR', payload: undefined });
        setSyncDirty(true);
    };


    // ================= SYNC LOGIC =================

    const performUpload = useCallback(async (isAuto = false) => {
        const { settings } = stateRef.current;
        if (!settings.webdavUrl || !settings.webdavUrl.trim()) {
            if (!isAuto) throw new Error("WebDAV not configured");
            return;
        }

        dispatch({ type: 'SET_SYNC_STATUS', payload: 'syncing' });

        try {
            const syncer = new SyncService(settings);
            await syncer.checkConnection();
            await syncer.performSync(); // Smart Sync

            dispatch({ type: 'SET_SYNC_STATUS', payload: 'success' });
            logBackup({ id: generateId(), timestamp: Date.now(), type: 'full', action: 'upload', status: 'success', file: 'Sync', message: isAuto ? "Auto sync complete" : "Manual sync complete" });

            // Reload data from DB to UI after sync (to reflect merged changes)
            const [ledgers, cats, txs] = await Promise.all([
                dbAPI.getLedgers(),
                dbAPI.getCategories(),
                dbAPI.getTransactions()
            ]);
            dispatch({ type: 'RESTORE_DATA', payload: { ledgers, categories: cats, transactions: txs } });

            setSyncDirty(false);
            setTimeout(() => dispatch({ type: 'SET_SYNC_STATUS', payload: 'idle' }), 3000);

        } catch (e: any) {
            console.error("Sync Failed:", e);
            dispatch({ type: 'SET_SYNC_STATUS', payload: 'error' });
            logBackup({ id: generateId(), timestamp: Date.now(), type: 'full', action: 'upload', status: 'failure', file: 'Sync', message: e.message });
            if (!isAuto) throw e;
        }
    }, []);

    // ============ D1 Sync ============ //
    const hasGroupStoreNow = () => {
        const exists = db.tables.some(t => (t as any).name === 'categoryGroups');
        if (!exists) return false;
        return true;
    };

    const reloadGroupsToState = useCallback(async () => {
        try {
            const groups = await dbAPI.getCategoryGroups();
            dispatch({ type: 'RESTORE_DATA', payload: { categoryGroups: groups } });
        } catch { }
    }, []);

    const mergeFromCloud = useCallback(async (payload: { ledgers: any[]; categories: any[]; groups?: any[]; transactions: any[]; settings: any; version: number }) => {
        const { ledgers = [], categories = [], groups = [], transactions = [], settings, version } = payload;
        const hasGroupStore = hasGroupStoreNow();

        await (db as any).transaction('rw', db.ledgers, db.categories, db.transactions, db.settings, hasGroupStore ? db.categoryGroups : undefined, async () => {
            for (const l of ledgers) {
                const normalized: Ledger = { id: l.id, name: l.name, themeColor: l.theme_color || l.themeColor || '#007AFF', createdAt: l.created_at || Date.now(), updatedAt: l.updated_at || Date.now(), isDeleted: !!l.is_deleted };
                const local = await db.ledgers.get(normalized.id);
                // 删除标记优先同步，避免另一端保留旧数据
                if (normalized.isDeleted || !local || (local.updatedAt || 0) < (normalized.updatedAt || 0)) {
                    await db.ledgers.put(normalized);
                }
            }
            for (const c of categories) {
                const normalized: Category = { id: c.id, ledgerId: c.ledger_id || c.ledgerId, name: c.name, icon: c.icon, type: c.type, order: c.order ?? 0, isCustom: c.isCustom, updatedAt: c.updated_at || Date.now(), isDeleted: !!c.is_deleted };
                const local = await db.categories.get(normalized.id);
                if (normalized.isDeleted || !local || (local.updatedAt || 0) < (normalized.updatedAt || 0)) {
                    await db.categories.put(normalized);
                }
            }
            if (hasGroupStore) {
                for (const g of groups) {
                    const normalized: CategoryGroup = { id: g.id, ledgerId: g.ledger_id || g.ledgerId, name: g.name, categoryIds: Array.isArray(g.category_ids) ? g.category_ids : (() => { try { return JSON.parse(g.category_ids || '[]'); } catch { return []; } })(), order: g.order ?? 0, updatedAt: g.updated_at || Date.now(), isDeleted: !!g.is_deleted };
                    const local = await db.categoryGroups.get(normalized.id);
                    if (normalized.isDeleted || !local || (local.updatedAt || 0) < (normalized.updatedAt || 0)) {
                        await db.categoryGroups.put(normalized);
                    }
                }
            }
            for (const t of transactions) {
                const normalized: Transaction = {
                    id: t.id, ledgerId: t.ledger_id, amount: t.amount, type: t.type, categoryId: t.category_id,
                    date: t.date, note: t.note || '', createdAt: t.created_at || t.date || Date.now(),
                    updatedAt: t.updated_at || t.date || Date.now(), isDeleted: !!t.is_deleted,
                    attachments: t.attachments ? (Array.isArray(t.attachments) ? t.attachments : JSON.parse(t.attachments)) : []
                };
                const local = await db.transactions.get(normalized.id);
                // 删除标记强制覆盖，保证跨设备删除生效
                if (normalized.isDeleted || !local || (local.updatedAt || 0) < (normalized.updatedAt || 0)) {
                    await db.transactions.put(normalized);
                }
            }

            // cfConfig is now part of settings.data, no separate handling needed

            if (settings) {
                const dataObj = typeof settings.data === 'string'
                    ? (() => { try { return JSON.parse(settings.data); } catch { return {}; } })()
                    : (settings.data || settings);

                // CRITICAL FIX: Merge Logic to Prefer Cloud Settings but Preserve Connection
                const dbSettingsRow = await db.settings.get('main');
                const localSettings = normalizeAppSettings(
                    { ...(dbSettingsRow?.value || DEFAULT_SETTINGS), ...stateRef.current.settings },
                    DEFAULT_SETTINGS
                );
                const localReminderDays = normalizeBackupReminderDays(
                    localSettings.backupReminderDays,
                    DEFAULT_SETTINGS.backupReminderDays ?? 7
                );
                const cloudString = (key: string, fallback: string) =>
                    Object.prototype.hasOwnProperty.call(dataObj, key)
                        ? String(dataObj[key] ?? '')
                        : fallback;

                const newSettings = {
                    ...localSettings, // Start with local structure
                    ...dataObj,       // Overlay Cloud Settings (Wins for preferences, ledgers, etc.)

                    // Keep auth/session local while allowing WebDAV credentials to follow the account.
                    webdavUrl: cloudString('webdavUrl', localSettings.webdavUrl),
                    webdavUser: cloudString('webdavUser', localSettings.webdavUser),
                    webdavPass: cloudString('webdavPass', localSettings.webdavPass),
                    cfConfig: localSettings.cfConfig,
                    authSession: localSettings.authSession,
                    authMode: localSettings.authSession ? 'authenticated' : 'guest',
                    backupReminderDays: localReminderDays <= 0
                        ? 0
                        : normalizeBackupReminderDays(
                            dataObj.backupReminderDays,
                            localSettings.backupReminderDays ?? DEFAULT_SETTINGS.backupReminderDays ?? 7
                        ),

                    // PRESERVE Local First Run state if false
                    isFirstRun: localSettings.isFirstRun === false ? false : (dataObj.isFirstRun ?? DEFAULT_SETTINGS.isFirstRun),
                    lastSyncVersion: settings.updated_at || Date.now()
                };

                await db.settings.put({
                    key: 'main',
                    value: normalizeAppSettings(newSettings, DEFAULT_SETTINGS)
                });
            }
        });

        const [ledgersNew, catsNew, txsNew, groupsNew, settingsRow] = await Promise.all([
            dbAPI.getLedgers(),
            dbAPI.getCategories(),
            dbAPI.getTransactions(),
            hasGroupStore ? dbAPI.getCategoryGroups() : Promise.resolve([]),
            db.settings.get('main')
        ]);
        const nextSettings = normalizeAppSettings({ ...(settingsRow?.value || stateRef.current.settings), lastSyncVersion: version }, DEFAULT_SETTINGS);
        stateRef.current = {
            ...stateRef.current,
            ledgers: ledgersNew,
            categories: catsNew,
            categoryGroups: groupsNew,
            transactions: txsNew,
            settings: nextSettings,
        };
        dispatch({ type: 'RESTORE_DATA', payload: { ledgers: ledgersNew, categories: catsNew, categoryGroups: groupsNew, transactions: txsNew, settings: nextSettings } });
    }, []);

    const performCloudSync = useCallback(async (reason: 'auto' | 'manual' | 'migration' = 'auto') => {
        const { lastSyncVersion } = stateRef.current.settings;
        const authSession = getActiveAuthSession();

        // Skip auto-sync if we just restored to prevent overwriting cloud with local state
        if (reason === 'auto' && isRestoringRef.current) {
            return;
        }

        if (!authSession || !isDBLoaded || !stateRef.current.isOnline) return;
        const ready = await ensureStoresReady();
        if (!ready) {
            dispatch({ type: 'SET_SYNC_STATUS', payload: 'error' });
            dispatch({ type: 'SET_LAST_SYNC_ERROR', payload: '本地数据库结构异常，已停止同步以保护本地数据' });
            return;
        }
        const hasGroupStore = true; // 始终尝试同步分组，避免误判跳过
        dispatch({ type: 'SET_SYNC_STATUS', payload: 'syncing' });
        try {
            // Priority: Sync pending images first
            try {
                await imageService.syncPendingImages();
            } catch (e) {
                console.warn('Image sync warning:', e);
            }

            // 如果本地为空（常见于重置/首次恢复），强制全量 push/pull，避免 lastSyncVersion 过大导致云端数据未拉取
            const forceFullSync = reason === 'manual' || reason === 'migration';
            let sinceForPush = forceFullSync ? 0 : (lastSyncVersion || 0);
            let sinceForPull = forceFullSync ? 0 : (lastSyncVersion || 0);
            const [txAll, ledgersAll, catsAll, groupsAll, queuedSyncItems] = await Promise.all([
                dbAPI.getAllTransactionsIncludingDeleted(),
                dbAPI.getAllLedgersIncludingDeleted(),
                dbAPI.getAllCategoriesIncludingDeleted(),
                dbAPI.getAllCategoryGroupsIncludingDeleted(),
                dbAPI.getSyncQueueItems(),
            ]);
            const isLocalEmpty = txAll.length === 0 && ledgersAll.length === 0 && catsAll.length === 0 && groupsAll.length === 0;
            if (isLocalEmpty) {
                sinceForPush = 0;
                sinceForPull = 0;
            }
            const queuedIds = (entityType: SyncQueueItem['entityType']) =>
                new Set(queuedSyncItems.filter(item => item.entityType === entityType).map(item => item.entityId));
            const filterForSync = <T extends { id?: string; updatedAt?: number; updated_at?: number }>(arr: T[], entityType: SyncQueueItem['entityType']) => {
                const ids = queuedIds(entityType);
                if (sinceForPush === 0) return arr;
                return arr.filter(item => (item.updatedAt ?? item.updated_at ?? 0) > sinceForPush || (item.id ? ids.has(item.id) : false));
            };

            const txFiltered = filterForSync(txAll, 'transaction');
            const ledgersFiltered = filterForSync(ledgersAll, 'ledger');
            const catsFiltered = filterForSync(catsAll, 'category');
            const groupsFiltered = filterForSync(groupsAll, 'categoryGroup');

            // Fallback to the first available ledger if current is missing
            const defaultLedgerId = ledgersAll[0]?.id || 'default';

            const mapLedger = (l: any) => ({
                id: l.id,
                name: l.name,
                theme_color: l.themeColor || l.theme_color,
                created_at: l.createdAt || l.created_at || Date.now(),
                updated_at: l.updatedAt || l.updated_at || Date.now(),
                is_deleted: !!l.isDeleted
            });
            const mapCategory = (c: any) => ({
                id: c.id,
                ledger_id: c.ledgerId || c.ledger_id || stateRef.current.currentLedgerId || defaultLedgerId,
                name: c.name,
                icon: c.icon,
                type: c.type,
                order: c.order ?? 0,
                is_custom: !!(c.isCustom ?? c.is_custom),
                updated_at: c.updatedAt || c.updated_at || Date.now(),
                is_deleted: !!c.isDeleted
            });
            const mapGroup = (g: any) => ({
                id: g.id,
                ledger_id: g.ledgerId || g.ledger_id || stateRef.current.currentLedgerId || defaultLedgerId,
                name: g.name,
                // 直接传数组，服务端负责序列化，避免重复 stringify 导致丢失
                category_ids: g.categoryIds || g.category_ids || [],
                order: g.order ?? 0,
                updated_at: g.updatedAt || g.updated_at || Date.now(),
                is_deleted: !!g.isDeleted
            });
            const mapTx = (t: any) => ({
                id: t.id,
                ledger_id: t.ledgerId || t.ledger_id,
                amount: t.amount,
                type: t.type,
                category_id: t.categoryId || t.category_id,
                date: t.date,
                note: t.note || '',
                attachments: t.attachments || [],
                created_at: t.createdAt || t.created_at || t.date || Date.now(),
                updatedAt: t.updatedAt || t.updated_at || t.date || Date.now(),
                is_deleted: !!t.isDeleted
            });

            // cfConfig is now part of settings, no separate field needed
            const payload = {
                ledgers: ledgersFiltered.map(mapLedger),
                categories: catsFiltered.map(mapCategory),
                groups: groupsFiltered.map(mapGroup),
                transactions: txFiltered.map(mapTx),
                settings: { data: withoutLocalAuthSecrets(stateRef.current.settings), updated_at: Date.now() }
            };
            await pushToCloud(authSession.token, payload);
            // 手动同步强制全量拉取（since=0），避免版本偏差导致删除未拉取
            const pulled = await pullFromCloud(authSession.token, sinceForPull);
            await mergeFromCloud(pulled);
            await dbAPI.markSyncQueueItemsSynced(queuedSyncItems);
            await refreshPendingSyncCount();
            // 重新从本地 DB 取分组，确保 UI 状态刷新
            const groupsReloaded = await dbAPI.getCategoryGroups();
            dispatch({ type: 'RESTORE_DATA', payload: { categoryGroups: groupsReloaded } });
            setSyncDirty(false);
            logBackup({ id: generateId(), timestamp: Date.now(), type: 'full', action: 'upload', status: 'success', file: 'D1 Sync', message: reason === 'manual' ? '手动同步成功' : reason === 'migration' ? '账号接管同步成功' : '自动同步成功' });
            dispatch({ type: 'SET_SYNC_STATUS', payload: 'success' });
            dispatch({ type: 'SET_LAST_SYNC_ERROR', payload: undefined });
            setTimeout(() => dispatch({ type: 'SET_SYNC_STATUS', payload: 'idle' }), 2000);
        } catch (e: any) {
            console.error('Cloud sync failed', e);
            if (e?.status === 401) {
                await clearAuthSession();
            }
            dispatch({ type: 'SET_SYNC_STATUS', payload: 'error' });
            dispatch({ type: 'SET_LAST_SYNC_ERROR', payload: e?.status === 401 ? '登录已失效，请重新登录' : (e?.message || '同步失败') });
            logBackup({ id: generateId(), timestamp: Date.now(), type: 'full', action: 'upload', status: 'failure', file: 'D1 Sync', message: e?.message || '同步失败' });
            if (reason === 'manual') alert('Sync failed: ' + (e?.message || 'unknown error'));
            await refreshPendingSyncCount();
            setSyncDirty(true);
            if (reason === 'migration') throw e;
        }
    }, [isDBLoaded, mergeFromCloud, refreshPendingSyncCount, clearAuthSession]);

    const runAccountTakeover = useCallback(async (session: AuthSession) => {
        if (accountTakeoverRunningRef.current) return;

        accountTakeoverRunningRef.current = true;
        isRestoringRef.current = true;
        dispatch({ type: 'SET_SYNC_STATUS', payload: 'syncing' });

        let pushError = '';

        try {
            const ready = await ensureStoresReady();
            if (!ready) throw new Error('本地数据库结构异常，已停止账号接管以保护本地数据');

            await persistAuthSettings({
                authSession: session,
                authMode: 'authenticated',
                lastSyncVersion: 0,
            });

            const localCountBeforePull = await countLocalDataRecords();
            let accountHasData = false;
            try {
                const accountPayload = await pullFromCloud(session.token, 0);
                accountHasData = hasPulledRows(accountPayload);
                await mergeFromCloud(accountPayload);
            } catch (e: any) {
                if (e?.status === 401) {
                    await clearAuthSession();
                    throw new Error('登录已失效，请重新登录');
                }
                console.warn('Initial authenticated pull skipped during takeover', e);
            }

            const shouldSeedEmptyAccount = !accountHasData && localCountBeforePull > 0;

            if (shouldSeedEmptyAccount) {
                await persistAuthSettings({ lastSyncVersion: 0 });
                const queuedImages = await queueCachedImagesForUpload();
                if (queuedImages > 0) {
                    logBackup({
                        id: generateId(),
                        timestamp: Date.now(),
                        type: 'mixed',
                        action: 'upload',
                        status: 'success',
                        file: 'Image Migration',
                        message: `账号接管已将 ${queuedImages} 张本地缓存图片加入上传队列`,
                    });
                }
                await markAllLocalDataForSync();
                await refreshPendingSyncCount();
                try {
                    await performCloudSync('migration');
                } catch (e: any) {
                    pushError = e?.message || '账号接管同步失败';
                }
            }

            if (!shouldSeedEmptyAccount) {
                const pendingCount = await refreshPendingSyncCount();
                if (pendingCount > 0) {
                    const restoreGuard = isRestoringRef.current;
                    try {
                        isRestoringRef.current = false;
                        await performCloudSync('auto');
                    } catch (e: any) {
                        pushError = e?.message || '账号同步失败';
                    } finally {
                        isRestoringRef.current = restoreGuard;
                    }
                }
            }

            if (pushError) {
                dispatch({ type: 'SET_SYNC_STATUS', payload: 'error' });
                dispatch({ type: 'SET_LAST_SYNC_ERROR', payload: pushError });
                setSyncDirty(true);
                if (typeof window !== 'undefined') {
                    window.alert(`账号已登录，但同步未完全完成：${pushError}`);
                }
            } else {
                dispatch({ type: 'SET_SYNC_STATUS', payload: 'success' });
                dispatch({ type: 'SET_LAST_SYNC_ERROR', payload: undefined });
                setTimeout(() => dispatch({ type: 'SET_SYNC_STATUS', payload: 'idle' }), 2000);
            }
        } catch (e: any) {
            const message = e?.message || '账号接管失败';
            dispatch({ type: 'SET_SYNC_STATUS', payload: 'error' });
            dispatch({ type: 'SET_LAST_SYNC_ERROR', payload: message });
            setSyncDirty(true);
            throw e;
        } finally {
            accountTakeoverRunningRef.current = false;
            isRestoringRef.current = false;
        }
    }, [clearAuthSession, mergeFromCloud, performCloudSync, persistAuthSettings, refreshPendingSyncCount]);

    const loginAccount = useCallback(async (username: string, password: string) => {
        const session = await authLogin(username, password);
        await runAccountTakeover(session);
        return session;
    }, [runAccountTakeover]);

    const registerAccount = useCallback(async (username: string, password: string, inviteCode: string) => {
        const session = await authRegister(username, password, inviteCode);
        await runAccountTakeover(session);
        return session;
    }, [runAccountTakeover]);

    const logoutAccount = useCallback(async () => {
        const session = getActiveAuthSession();
        if (session?.token) {
            try {
                await authLogout(session.token);
            } catch (e) {
                console.warn('Remote logout failed, clearing local session', e);
            }
        }
        await clearAuthSession();
        dispatch({ type: 'SET_LAST_SYNC_ERROR', payload: undefined });
        setSyncDirty(false);
    }, [clearAuthSession]);

    useEffect(() => {
        if (!syncDirty) return;
        // Use stateRef to avoid infinite loop caused by state.settings changes
        const { webdavUrl, syncDebounceSeconds } = stateRef.current.settings;
        if (!stateRef.current.isOnline) return;

        const hasD1 = !!getActiveAuthSession();
        const hasWebDAV = webdavUrl;

        if (!hasD1 && !hasWebDAV) return;

        if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
        const delaySec = syncDebounceSeconds ?? 3;

        syncTimerRef.current = setTimeout(async () => {
            if (hasD1) await performCloudSync('auto');
            // WebDAV only for manual backup or scheduled auto-backup, not real-time sync
            // if (hasWebDAV) await performUpload(true);
        }, Math.max(1000, delaySec * 1000));

        return () => { if (syncTimerRef.current) clearTimeout(syncTimerRef.current); };
    }, [syncDirty, performCloudSync, performUpload]);

    // Version lightweight polling
    useEffect(() => {
        if (versionCheckTimerRef.current) clearInterval(versionCheckTimerRef.current);
        if (versionCheckDelayTimerRef.current) clearTimeout(versionCheckDelayTimerRef.current);
        if (versionVisibilityDebounceRef.current) clearTimeout(versionVisibilityDebounceRef.current);
        if (!isDBLoaded) return;
        const { authSession, authMode, versionCheckIntervalFg, versionCheckIntervalBg } = state.settings;
        if (authMode !== 'authenticated' || !authSession?.token || !state.isOnline) return;
        const fg = Math.max(3, versionCheckIntervalFg ?? 10);
        const bg = Math.max(fg, versionCheckIntervalBg ?? 20);
        const getInterval = () => (document.visibilityState === 'visible' ? fg : bg) * 1000;

        const checkVersion = async () => {
            if (versionCheckRunningRef.current) return;
            versionCheckRunningRef.current = true;
            try {
                // 1. Check Remote Version
                let remoteVersion = 0;
                try {
                    remoteVersion = await getCloudVersion(authSession.token);
                } catch (e: any) {
                    if (e?.status === 401) {
                        await clearAuthSession();
                    }
                }

                // 2. Check Local Unsynced Data
                const localVersion = stateRef.current.settings.lastSyncVersion || 0;
                const hasLocalChanges = await dbAPI.hasUnsyncedData(localVersion);

                // 3. Trigger Sync if needed
                if (remoteVersion > localVersion || hasLocalChanges) {
                    console.log(`[AutoSync] Triggering sync. Remote: ${remoteVersion}, Local: ${localVersion}, HasChanges: ${hasLocalChanges}`);
                    await performCloudSync('auto');
                }
            } catch (e) {
                // silent fail
            } finally {
                versionCheckRunningRef.current = false;
            }
        };

        const scheduleDelayedCheck = (delayMs: number) => {
            if (versionCheckDelayTimerRef.current) clearTimeout(versionCheckDelayTimerRef.current);
            versionCheckDelayTimerRef.current = setTimeout(checkVersion, delayMs);
        };

        scheduleDelayedCheck(5000);
        versionCheckTimerRef.current = setInterval(checkVersion, getInterval());

        const handleVisibility = () => {
            if (versionCheckTimerRef.current) clearInterval(versionCheckTimerRef.current);
            if (versionVisibilityDebounceRef.current) clearTimeout(versionVisibilityDebounceRef.current);
            versionCheckTimerRef.current = setInterval(checkVersion, getInterval());
            if (document.visibilityState === 'visible') {
                versionVisibilityDebounceRef.current = setTimeout(checkVersion, 1500);
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => {
            if (versionCheckTimerRef.current) clearInterval(versionCheckTimerRef.current);
            if (versionCheckDelayTimerRef.current) clearTimeout(versionCheckDelayTimerRef.current);
            if (versionVisibilityDebounceRef.current) clearTimeout(versionVisibilityDebounceRef.current);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [isDBLoaded, state.settings.authMode, state.settings.authSession?.token, state.settings.versionCheckIntervalFg, state.settings.versionCheckIntervalBg, state.isOnline, performCloudSync, clearAuthSession]);

    // 自动备份：先同步 D1/KV 再执行 WebDAV 备份，并记录日志
    const runAutoBackup = useCallback(async () => {
        if (autoBackupRunningRef.current) return;
        autoBackupRunningRef.current = true;
        try {
            const settings = stateRef.current.settings;
            const hasWebdav = settings.webdavUrl && settings.webdavUser && settings.webdavPass;
            if (!settings.backupAutoEnabled || !hasWebdav) return;
            if (!stateRef.current.isOnline) return;

            // 先同步 D1/KV（若已配置）
            try {
                await performCloudSync('auto');
            } catch (e) {
                // 同步失败也继续备份，但会记录失败日志
            }

            await performUpload(true);
            const now = Date.now();
            dispatch({ type: 'UPDATE_SETTINGS', payload: { lastBackupTime: now, lastAutoBackupTime: now } });
            logBackup({ id: generateId(), timestamp: now, type: 'full', action: 'upload', status: 'success', file: 'Auto Backup', message: '定期自动备份完成' });
        } catch (e: any) {
            logBackup({ id: generateId(), timestamp: Date.now(), type: 'full', action: 'upload', status: 'failure', file: 'Auto Backup', message: e?.message || '自动备份失败' });
        } finally {
            autoBackupRunningRef.current = false;
        }
    }, [performCloudSync]);

    // 自动备份调度：按间隔触发
    useEffect(() => {
        if (autoBackupTimerRef.current) clearTimeout(autoBackupTimerRef.current);
        const settings = state.settings;
        const hasWebdav = settings.webdavUrl && settings.webdavUser && settings.webdavPass;
        const intervalDays = settings.backupIntervalDays ?? 7;
        if (!isDBLoaded || !settings.backupAutoEnabled || !hasWebdav || intervalDays <= 0) return;

        const last = settings.lastBackupTime || 0;
        const intervalMs = intervalDays * 24 * 60 * 60 * 1000;
        const now = Date.now();
        const elapsed = now - last;
        let delay = last ? Math.max(60 * 1000, intervalMs - elapsed) : 5 * 60 * 1000; // 未备份过时，5分钟后首次尝试
        autoBackupTimerRef.current = setTimeout(() => {
            runAutoBackup().finally(() => {
                // 再次调度
                const again = (settings.backupIntervalDays ?? 7) * 24 * 60 * 60 * 1000;
                autoBackupTimerRef.current = setTimeout(() => runAutoBackup(), Math.max(60 * 1000, again));
            });
        }, delay);

        return () => { if (autoBackupTimerRef.current) clearTimeout(autoBackupTimerRef.current); };
    }, [state.settings, isDBLoaded, runAutoBackup]);

    const manualBackup = async () => {
        await performUpload(false);
        dispatch({ type: 'UPDATE_SETTINGS', payload: { lastBackupTime: Date.now() } });
    };

    // For "Restore", we might still want the "wipe and replace" behavior or just trigger a sync
    const restoreFromCloud = async () => {
        // For safety, let's treat restore as "Force Pull" or just regular sync
        // But user expects "Restore" to fix messed up local data. 
        // So we will perform a Sync. The SyncService logic handles pulling cloud data.
        await performUpload(false);
    };

    const logOperation = (type: OperationLog['type'], targetId: string, details?: string) => {
        const log: OperationLog = { id: generateId(), type, timestamp: Date.now(), ledgerId: state.currentLedgerId, targetId, details };
        dispatch({ type: 'ADD_OPERATION_LOG', payload: log });
        db.operationLogs.put(log);
    };

    const logBackup = (log: BackupLog) => {
        dispatch({ type: 'ADD_BACKUP_LOG', payload: log });
        db.backupLogs.put(log);
    };

    const importData = (data: Partial<AppState>) => {
        // Legacy import support
        dispatch({ type: 'RESTORE_DATA', payload: data });
        // Also write to DB
        if (data.transactions) db.transactions.bulkPut(data.transactions.map(t => ({ ...t, isDeleted: false, updatedAt: Date.now() })));
        if (data.ledgers) db.ledgers.bulkPut(data.ledgers.map(l => ({ ...l, isDeleted: false, updatedAt: Date.now() })));
        if (data.categories) db.categories.bulkPut(data.categories.map(c => ({ ...c, isDeleted: false, updatedAt: Date.now() })));
        if (data.categoryGroups) db.categoryGroups.bulkPut(data.categoryGroups.map(g => ({ ...g, isDeleted: false, updatedAt: Date.now() })));
        if (data.settings) db.settings.put({ key: 'main', value: { ...DEFAULT_SETTINGS, ...data.settings } });
        setSyncDirty(true);
    };

    const smartImportCsv = async (csvContent: string, targetLedgerId: string = state.currentLedgerId) => {
        try {
            const parsedTxs = parseCsvToTransactions(csvContent);
            if (!parsedTxs || parsedTxs.length === 0) {
                alert("No records found in CSV, please check format");
                return;
            }

            const csvCats = extractCategoriesFromCsv(csvContent);
            const catMap = new Map<string, string>(); // key = type:name -> categoryId
            const newCats: Category[] = [];
            const nextOrder: Record<'expense' | 'income', number> = {
                expense: Math.max(-1, ...state.categories.filter(c => c.type === 'expense').map(c => c.order ?? 0)) + 1,
                income: Math.max(-1, ...state.categories.filter(c => c.type === 'income').map(c => c.order ?? 0)) + 1,
            };

            const registerCat = (nameRaw: string, typeRaw: 'expense' | 'income'): string => {
                const type = typeRaw === 'income' ? 'income' : 'expense';
                const name = (nameRaw || 'Other').trim();
                const key = type + ':' + name;
                if (catMap.has(key)) return catMap.get(key)!;
                const existing = state.categories.find(c => c.type === type && (c.name === name || c.id === name));
                if (existing) {
                    catMap.set(key, existing.id);
                    return existing.id;
                }
                const newCat: Category = { id: generateId(), name, icon: 'Circle', type, order: nextOrder[type]++, isCustom: true, updatedAt: Date.now(), isDeleted: false };
                newCats.push(newCat);
                catMap.set(key, newCat.id);
                return newCat.id;
            };

            // Register categories first
            csvCats.forEach(c => registerCat(c.name, c.type));

            // Persist new categories
            newCats.forEach(c => enhancedDispatch({ type: 'ADD_CATEGORY', payload: c }));

            // Normalize and persist transactions
            for (const tx of parsedTxs) {
                const mappedCatId = registerCat(tx.categoryId || 'Other', tx.type === 'income' ? 'income' : 'expense');
                const normalized: Transaction = {
                    ...tx,
                    id: tx.id || generateId(),
                    ledgerId: targetLedgerId,
                    categoryId: mappedCatId,
                    type: tx.type === 'income' ? 'income' : 'expense',
                    note: tx.note || '',
                    createdAt: tx.createdAt || tx.date || Date.now(),
                    updatedAt: tx.updatedAt || tx.date || Date.now(),
                    isDeleted: false,
                };
                await addTransaction(normalized);
            }

            alert("Import finished, " + parsedTxs.length + " records added");
        } catch (e: any) {
            console.error(e);
            alert("Import failed: " + (e?.message || 'parse error'));
        }
    };

    const manualCloudSync = async () => {
        await performCloudSync('manual');
    };

    // D1/KV 只拉取恢复（不会推送本地），适合首次“恢复数据”
    const restoreFromD1 = useCallback(async () => {
        setIsRestoring(true);
        isRestoringRef.current = true; // Block auto-sync

        const authSession = getActiveAuthSession();
        if (!authSession) {
            isRestoringRef.current = false;
            setIsRestoring(false);
            throw new Error('请先登录账号');
        }

        const ready = await ensureStoresReady();
        if (!ready) {
            isRestoringRef.current = false;
            setIsRestoring(false);
            throw new Error('本地数据库结构异常，已停止恢复以保护本地数据');
        }

        dispatch({ type: 'SET_SYNC_STATUS', payload: 'syncing' });
        try {
            const pulled = await pullFromCloud(authSession.token, 0);
            await mergeFromCloud(pulled);
            dispatch({ type: 'UPDATE_SETTINGS', payload: { lastSyncVersion: pulled.version } });
            logBackup({ id: generateId(), timestamp: Date.now(), type: 'full', action: 'download', status: 'success', file: 'D1 Sync', message: '仅拉取恢复成功' });
            dispatch({ type: 'SET_SYNC_STATUS', payload: 'success' });
            setTimeout(() => dispatch({ type: 'SET_SYNC_STATUS', payload: 'idle' }), 2000);

            // Cooldown for auto-sync blockage
            setTimeout(() => { isRestoringRef.current = false; }, 10000);
        } catch (e: any) {
            isRestoringRef.current = false;
            if (e?.status === 401) {
                await clearAuthSession();
            }
            logBackup({ id: generateId(), timestamp: Date.now(), type: 'full', action: 'download', status: 'failure', file: 'D1 Sync', message: e?.message || '恢复失败' });
            dispatch({ type: 'SET_SYNC_STATUS', payload: 'error' });
            setSyncDirty(true);
            throw e;
        } finally {
            setIsRestoring(false);
        }
    }, [mergeFromCloud, clearAuthSession]);

    const addLedger = async (ledger: Ledger) => {
        dispatch({ type: 'ADD_LEDGER', payload: ledger });
        dispatch({ type: 'SET_LEDGER', payload: ledger.id });
        await db.ledgers.put(ledger);
        feedback.play('success');
        feedback.vibrate('success');
        logOperation('add', ledger.id, `Created ledger: ${ledger.name}`);

        // Auto-seed default categories for the new ledger
        const timestamp = Date.now();
        const newCategories = DEFAULT_CATEGORIES.map((c, idx) => ({
            ...c,
            id: `${generateId()}_${timestamp}_${idx}`, // Ensure unique ID
            ledgerId: ledger.id,
            order: idx,
            updatedAt: timestamp,
            isDeleted: false
        }));

        // Dispatch and persist categories
        for (const cat of newCategories) {
            dispatch({ type: 'ADD_CATEGORY', payload: cat });
        }
        await db.categories.bulkPut(newCategories);
        setSyncDirty(true);
    };

    // Reset app: completely delete the IndexedDB database and reload
    const resetApp = async () => {
        if (!window.confirm('确认要退出并清空本地数据吗？这将删除本地账本/分类/流水、清除云同步和 WebDAV 配置，恢复为首次启动状态。')) return;

        try {
            // Stop any ongoing sync
            if (syncTimerRef.current) clearTimeout(syncTimerRef.current);

            // Clear localStorage
            if (typeof window !== 'undefined') {
                localStorage.removeItem('lastLedgerId');
                // Clear any other localStorage items if needed
            }

            // CRITICAL: Delete the entire database (not just clear tables)
            // This ensures complete cleanup including schema/version info
            await db.delete();

            // Reload the page to reinitialize with a fresh database
            window.location.reload();
        } catch (e: any) {
            console.error('Reset failed:', e);
            alert('重置失败: ' + (e?.message || '未知错误'));
        }
    };

    const triggerCloudSync = () => {
        setSyncDirty(true);
    };

    if (!isDBLoaded) {
        if (dbInitError) {
            return (
                <div className="min-h-screen bg-ios-bg text-ios-text flex items-center justify-center p-6">
                    <div className="max-w-sm rounded-2xl border border-ios-border bg-white dark:bg-zinc-900 p-5 shadow-sm">
                        <h1 className="text-base font-semibold mb-2">本地数据库异常</h1>
                        <p className="text-sm text-ios-subtext mb-3">为避免账目丢失，应用已停止自动重建数据库。请不要清理浏览器数据，可尝试关闭其他已打开的应用窗口后重新进入。</p>
                        <p className="text-xs text-red-500 break-words">{dbInitError}</p>
                    </div>
                </div>
            );
        }
        return (
            <div className="min-h-screen bg-ios-bg text-ios-text flex items-center justify-center p-6">
                <div className="flex flex-col items-center gap-3 text-ios-subtext">
                    <div className="h-6 w-6 rounded-full border-2 border-ios-border border-t-ios-primary animate-spin" />
                    <p className="text-sm">正在打开账本...</p>
                </div>
            </div>
        );
    }

    return (
        <AppContext.Provider value={{ state, dispatch: enhancedDispatch, addTransaction, updateTransaction, deleteTransaction, batchDeleteTransactions, batchUpdateTransactions, undo, canUndo: !!undoStack, manualBackup, manualCloudSync, importData, smartImportCsv, restoreFromCloud, resetApp, restoreFromD1, addLedger, triggerCloudSync, loginAccount, registerAccount, logoutAccount }}>
            {children}
        </AppContext.Provider>
    );
};

export const useApp = () => {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error('useApp must be used within an AppProvider');
    }
    return context;
};
