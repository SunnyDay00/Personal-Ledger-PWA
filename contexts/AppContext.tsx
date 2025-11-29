import React, { createContext, useContext, useReducer, useEffect, ReactNode, useState, useRef, useCallback } from 'react';
import { AppState, AppAction, Transaction, Ledger, OperationLog, BackupLog, Category, AppSettings } from '../types';
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS, INITIAL_LEDGERS } from '../constants';
import { UPDATE_LOGS } from '../changelog';
import { generateId, extractCategoriesFromCsv, formatCurrency, parseCsvToTransactions } from '../utils';
import { db, initAndMigrateDB, dbAPI } from '../services/db';
import { pushToCloud, pullFromCloud } from '../services/d1Sync';
import { SyncService } from '../services/sync';

const initialState: AppState = {
  ledgers: INITIAL_LEDGERS,
  transactions: [],
  categories: DEFAULT_CATEGORIES,
  settings: DEFAULT_SETTINGS,
  currentLedgerId: INITIAL_LEDGERS[0].id,
  operationLogs: [],
  backupLogs: [],
  updateLogs: UPDATE_LOGS,
  syncStatus: 'idle',
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
};

interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  addTransaction: (t: Transaction) => void;
  updateTransaction: (t: Transaction) => void;
  deleteTransaction: (id: string) => void;
  batchDeleteTransactions: (ids: string[]) => void;
  batchUpdateTransactions: (ids: string[], updates: Partial<Transaction>) => void;
  undo: () => void;
  canUndo: boolean;
  manualBackup: () => Promise<void>;
  manualCloudSync: () => Promise<void>;
  importData: (data: Partial<AppState>) => void;
  smartImportCsv: (csvContent: string, targetLedgerId?: string) => void;
  restoreFromCloud: () => Promise<void>;
  resetApp: () => Promise<void>;
  restoreFromD1: () => Promise<void>;
}

const AppContext = createContext<AppContextType>({
  state: initialState,
  dispatch: () => null,
  addTransaction: () => null,
  updateTransaction: () => null,
  deleteTransaction: () => null,
  batchDeleteTransactions: () => null,
  batchUpdateTransactions: () => null,
  undo: () => null,
  canUndo: false,
  manualBackup: async () => {},
  manualCloudSync: async () => {},
  importData: () => {},
  smartImportCsv: () => {},
  restoreFromCloud: async () => {},
  resetApp: async () => {},
  restoreFromD1: async () => {},
});

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_LEDGER':
      return { ...state, currentLedgerId: action.payload };
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
                ids.includes(t.id) ? { ...t, ...updates, updatedAt: Date.now() } : t
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
        return { 
            ...state, 
            ledgers: newLedgers,
            transactions: newTxs,
            currentLedgerId: state.currentLedgerId === action.payload ? (newLedgers[0]?.id || '') : state.currentLedgerId
        };
    }
    case 'UPDATE_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.payload } };
    case 'ADD_OPERATION_LOG':
      return { ...state, operationLogs: [action.payload, ...state.operationLogs] };
    case 'ADD_BACKUP_LOG':
      return { ...state, backupLogs: [action.payload, ...state.backupLogs] };
    case 'SET_SYNC_STATUS':
      return { ...state, syncStatus: action.payload };
    case 'SET_ONLINE_STATUS':
      return { ...state, isOnline: action.payload };
    case 'RESTORE_DATA':
      const newSettings = { ...state.settings, ...(action.payload.settings || {}) };
      return { ...state, ...action.payload, settings: newSettings };
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
        return { ...state, categories: [...state.categories, action.payload] };
    case 'UPDATE_CATEGORY':
        return { ...state, categories: state.categories.map(c => c.id === action.payload.id ? action.payload : c) };
    case 'DELETE_CATEGORY':
        return { ...state, categories: state.categories.filter(c => c.id !== action.payload) };
    case 'REORDER_CATEGORIES':
        if (action.payload.length === 0) return state;
        const type = action.payload[0].type;
        const otherCategories = state.categories.filter(c => c.type !== type);
        return { ...state, categories: [...otherCategories, ...action.payload] };
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

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [isDBLoaded, setIsDBLoaded] = useState(false);
  const [syncDirty, setSyncDirty] = useState(false);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoBackupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoBackupRunningRef = useRef(false);
  const autoBackupRef = useRef(false);

  // Initialize DB and Load State
  useEffect(() => {
    const init = async () => {
        await initAndMigrateDB();
        
        // Load data from DB to Memory for UI (ViewModel)
        const [settings, ledgers, categories, transactions, backupLogs] = await Promise.all([
            dbAPI.getSettings(),
            dbAPI.getLedgers(),
            dbAPI.getCategories(),
            dbAPI.getTransactions(),
            dbAPI.getBackupLogs()
        ]);

        const loadedSettings = settings ? { ...DEFAULT_SETTINGS, ...settings } : DEFAULT_SETTINGS;
        if (loadedSettings.enableCloudSync === undefined) loadedSettings.enableCloudSync = false;

        // Seed DB when鍏ㄦ柊鍚姩锛屼繚璇佸垎绫?璐︽湰瀛樺湪浜庢暟鎹簱涓究浜庡悗缁垹闄?鏇存柊
        const shouldSeedLedgers = !ledgers || ledgers.length === 0;
        const shouldSeedCategories = !categories || categories.length === 0;
        const shouldSeedSettings = !settings;
        const ledgerSeed = (shouldSeedLedgers ? INITIAL_LEDGERS : ledgers).map(l => ({ ...l, updatedAt: l.updatedAt || Date.now(), isDeleted: false }));
        const categorySeed = (shouldSeedCategories ? DEFAULT_CATEGORIES : categories).map((c, idx) => ({ ...c, order: c.order ?? idx, updatedAt: c.updatedAt || Date.now(), isDeleted: false }));
        if (shouldSeedLedgers) await db.ledgers.bulkPut(ledgerSeed);
        if (shouldSeedCategories) await db.categories.bulkPut(categorySeed);
        if (shouldSeedSettings) await db.settings.put({ key: 'main', value: loadedSettings });

        const newState: Partial<AppState> = {
            settings: loadedSettings,
            ledgers: ledgerSeed,
            categories: categorySeed,
            transactions: transactions || [],
            backupLogs: backupLogs || [],
            currentLedgerId: ledgerSeed[0]?.id || INITIAL_LEDGERS[0].id,
            syncStatus: 'idle',
            isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true
        };

        dispatch({ type: 'RESTORE_DATA', payload: newState });
        setIsDBLoaded(true);
    };
    init();
  }, []);

  // Persist Changes to DB (Write-Behind / Side-Effects)
  // We use this useEffect to save Settings whenever they change
  useEffect(() => {
      if(isDBLoaded) {
          dbAPI.saveSettings(state.settings);
      }
  }, [state.settings, isDBLoaded]);

  const [undoStack, setUndoStack] = useState<{ type: 'restore_delete'; data: Transaction } | { type: 'restore_batch'; data: Transaction[] } | null>(null);
  
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  // Online/Offline Listeners
  useEffect(() => {
    const handleOnline = () => dispatch({ type: 'SET_ONLINE_STATUS', payload: true });
    const handleOffline = () => dispatch({ type: 'SET_ONLINE_STATUS', payload: false });
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
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
      const thresholdDays = backupReminderDays ?? 7;
      // 仅在已配置 WebDAV 且存在有效的上次备份时间且开启提醒时提示
      if (!hasWebdav || !lastBackupTime || thresholdDays <= 0) return;
      const days = (Date.now() - lastBackupTime) / (1000 * 60 * 60 * 24);
      if (days > thresholdDays) {
          alert(`建议手动备份：距离上次备份已超过 ${thresholdDays} 天`);
          hasRemindedRef.current = true;
      }
  }, [isDBLoaded, state.settings.lastBackupTime, state.settings.webdavUrl, state.settings.webdavUser, state.settings.webdavPass, state.settings.backupReminderDays]);


  // ================= ACTIONS (DB + State) =================

  const addTransaction = (t: Transaction) => {
    // 1. Update UI
    dispatch({ type: 'ADD_TRANSACTION', payload: t });
    // 2. Write DB
    db.transactions.put({ ...t, updatedAt: Date.now(), isDeleted: false });

    // Logs & Notes
    if(t.note) dispatch({ type: 'SAVE_NOTE_HISTORY', payload: { categoryId: t.categoryId, note: t.note }});
    logOperation('add', t.id, 'Add ' + (t.type === 'expense' ? 'expense ' : 'income ') + t.amount);
    setSyncDirty(true);
  };

  const updateTransaction = (t: Transaction) => {
    dispatch({ type: 'UPDATE_TRANSACTION', payload: t });
    db.transactions.put({ ...t, updatedAt: Date.now(), isDeleted: false });
    
    if(t.note) dispatch({ type: 'SAVE_NOTE_HISTORY', payload: { categoryId: t.categoryId, note: t.note }});
    logOperation('edit', t.id, 'Update amount ' + t.amount);
    setSyncDirty(true);
  };

  const deleteTransaction = (id: string) => {
    const target = state.transactions.find(t => t.id === id);
    if (target) {
      dispatch({ type: 'DELETE_TRANSACTION', payload: id });
      // Soft Delete in DB
      db.transactions.update(id, { isDeleted: true, updatedAt: Date.now() });

      logOperation('delete', id, 'Delete ' + target.amount);
      setUndoStack({ type: 'restore_delete', data: target });
      setSyncDirty(true);
    }
  };

  const undo = () => {
    if (!undoStack) return;
    const now = Date.now();
    if (undoStack.type === 'restore_delete') {
        const restored = { ...undoStack.data, isDeleted: false, updatedAt: now };
        dispatch({ type: 'RESTORE_TRANSACTION', payload: restored });
        db.transactions.put(restored);
        logOperation('restore', restored.id, '撤回删除');
    } else if (undoStack.type === 'restore_batch') {
        const restoredList = undoStack.data.map(t => ({ ...t, isDeleted: false, updatedAt: now }));
        restoredList.forEach(r => dispatch({ type: 'RESTORE_TRANSACTION', payload: r }));
        db.transactions.bulkPut(restoredList);
        logOperation('restore', 'batch', `撤回批量删除 ${restoredList.length} 条`);
    }
    setUndoStack(null);
  };

  // Wrapper for dispatching category/ledger actions to also sync to DB
  const originalDispatch = dispatch;
  const enhancedDispatch: React.Dispatch<AppAction> = (action) => {
      originalDispatch(action);
      const markDirtyTypes: AppAction['type'][] = [
          'ADD_LEDGER','UPDATE_LEDGER','DELETE_LEDGER',
          'ADD_CATEGORY','UPDATE_CATEGORY','DELETE_CATEGORY','REORDER_CATEGORIES',
          'UPDATE_SETTINGS','BATCH_DELETE_TRANSACTIONS','BATCH_UPDATE_TRANSACTIONS'
      ];
      // Handle DB writes for non-transaction entities
      switch(action.type) {
          case 'ADD_LEDGER':
              db.ledgers.put({ ...action.payload, updatedAt: Date.now(), isDeleted: false });
              break;
          case 'UPDATE_LEDGER':
              db.ledgers.put({ ...action.payload, updatedAt: Date.now() });
              break;
          case 'DELETE_LEDGER':
              db.ledgers.update(action.payload, { isDeleted: true, updatedAt: Date.now() });
              // Also soft delete txs
              db.transactions.where('ledgerId').equals(action.payload).modify({ isDeleted: true, updatedAt: Date.now() });
              break;
          case 'ADD_CATEGORY':
              db.categories.put({ ...action.payload, updatedAt: Date.now(), isDeleted: false });
              break;
          case 'UPDATE_CATEGORY':
              db.categories.put({ ...action.payload, updatedAt: Date.now() });
              break;
          case 'UPDATE_SETTINGS': // Note: Settings handled by useEffect, but could be here too
              break;
          case 'DELETE_CATEGORY':
              db.categories.update(action.payload, { isDeleted: true, updatedAt: Date.now() });
              break;
          case 'REORDER_CATEGORIES':
              db.categories.bulkPut(action.payload.map(c => ({...c, updatedAt: Date.now()})));
              break;
          case 'BATCH_DELETE_TRANSACTIONS':
              db.transactions.where('id').anyOf(action.payload).modify({ isDeleted: true, updatedAt: Date.now() });
              break;
          case 'BATCH_UPDATE_TRANSACTIONS': {
              const { ids, updates } = action.payload;
              const now = Date.now();
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

  const batchDeleteTransactions = (ids: string[]) => {
      if (!ids || ids.length === 0) return;
      const deletedTxs = state.transactions.filter(t => ids.includes(t.id));
      enhancedDispatch({ type: 'BATCH_DELETE_TRANSACTIONS', payload: ids });
      setUndoStack({ type: 'restore_batch', data: deletedTxs });
      logOperation('delete', 'batch', '批量删除 ' + ids.length + ' 条');
  };

  const batchUpdateTransactions = (ids: string[], updates: Partial<Transaction>) => {
      if (!ids || ids.length === 0) return;
      if (!updates || Object.keys(updates).length === 0) return;
      enhancedDispatch({ type: 'BATCH_UPDATE_TRANSACTIONS', payload: { ids, updates } });
      const noteToSave = updates.note;
      const categoryForNote = updates.categoryId || state.transactions.find(t => ids.includes(t.id))?.categoryId;
      if (noteToSave && categoryForNote) {
          dispatch({ type: 'SAVE_NOTE_HISTORY', payload: { categoryId: categoryForNote, note: noteToSave } });
      }
      logOperation('edit', 'batch', 'Batch update ' + ids.length + ' items');
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

          setTimeout(() => dispatch({ type: 'SET_SYNC_STATUS', payload: 'idle' }), 3000);

      } catch (e: any) {
          console.error("Sync Failed:", e);
          dispatch({ type: 'SET_SYNC_STATUS', payload: 'error' });
          logBackup({ id: generateId(), timestamp: Date.now(), type: 'full', action: 'upload', status: 'failure', file: 'Sync', message: e.message });
          if (!isAuto) throw e;
      }
  }, []);

  // ============ D1 Sync ============ //
  const mergeFromCloud = useCallback(async (payload: {ledgers:any[]; categories:any[]; transactions:any[]; settings:any; version:number}) => {
      const { ledgers = [], categories = [], transactions = [], settings, version } = payload;

      await (db as any).transaction('rw', db.ledgers, db.categories, db.transactions, db.settings, async () => {
          for (const l of ledgers) {
              const normalized: Ledger = { id: l.id, name: l.name, themeColor: l.theme_color || l.themeColor || '#007AFF', createdAt: l.created_at || Date.now(), updatedAt: l.updated_at || Date.now(), isDeleted: !!l.is_deleted };
              const local = await db.ledgers.get(normalized.id);
              if (!local || (local.updatedAt || 0) < (normalized.updatedAt || 0)) {
                  await db.ledgers.put(normalized);
              }
          }
          for (const c of categories) {
              const normalized: Category = { id: c.id, name: c.name, icon: c.icon, type: c.type, order: c.order ?? 0, isCustom: c.isCustom, updatedAt: c.updated_at || Date.now(), isDeleted: !!c.is_deleted };
              const local = await db.categories.get(normalized.id);
              if (!local || (local.updatedAt || 0) < (normalized.updatedAt || 0)) {
                  await db.categories.put(normalized);
              }
          }
          for (const t of transactions) {
              const normalized: Transaction = {
                  id: t.id, ledgerId: t.ledger_id, amount: t.amount, type: t.type, categoryId: t.category_id,
                  date: t.date, note: t.note || '', createdAt: t.created_at || t.date || Date.now(),
                  updatedAt: t.updated_at || t.date || Date.now(), isDeleted: !!t.is_deleted
              };
              const local = await db.transactions.get(normalized.id);
              if (!local || (local.updatedAt || 0) < (normalized.updatedAt || 0)) {
                  await db.transactions.put(normalized);
              }
          }
          if (settings) {
              const dataObj = typeof settings.data === 'string' ? (() => { try { return JSON.parse(settings.data); } catch { return {}; } })() : (settings.data || {});
              await db.settings.put({ key: 'main', value: { ...DEFAULT_SETTINGS, ...stateRef.current.settings, ...dataObj, lastSyncVersion: settings.updated_at || Date.now() } });
          }
      });

      const [ledgersNew, catsNew, txsNew, settingsRow] = await Promise.all([
          dbAPI.getLedgers(),
          dbAPI.getCategories(),
          dbAPI.getTransactions(),
          db.settings.get('main')
      ]);
      dispatch({ type: 'RESTORE_DATA', payload: { ledgers: ledgersNew, categories: catsNew, transactions: txsNew, settings: settingsRow?.value } });
      dispatch({ type: 'UPDATE_SETTINGS', payload: { lastSyncVersion: version } });
  }, []);

  const performCloudSync = useCallback(async (reason: 'auto' | 'manual' = 'auto') => {
      const { syncEndpoint, syncToken, syncUserId, lastSyncVersion } = stateRef.current.settings;
      if (!syncEndpoint || !syncToken || !isDBLoaded || !stateRef.current.isOnline) return;
      dispatch({ type: 'SET_SYNC_STATUS', payload: 'syncing' });
      try {
          const payload = {
              ledgers: stateRef.current.ledgers,
              categories: stateRef.current.categories,
              transactions: stateRef.current.transactions,
              settings: { data: stateRef.current.settings, updated_at: Date.now() }
          };
          await pushToCloud(syncEndpoint, syncToken, syncUserId || 'default', payload);
          const pulled = await pullFromCloud(syncEndpoint, syncToken, syncUserId || 'default', lastSyncVersion || 0);
          await mergeFromCloud(pulled);
          setSyncDirty(false);
          logBackup({ id: generateId(), timestamp: Date.now(), type: 'full', action: 'upload', status: 'success', file: 'D1 Sync', message: reason === 'manual' ? '手动同步成功' : '自动同步成功' });
          dispatch({ type: 'SET_SYNC_STATUS', payload: 'success' });
          setTimeout(() => dispatch({ type: 'SET_SYNC_STATUS', payload: 'idle' }), 2000);
      } catch (e: any) {
          console.error('Cloud sync failed', e);
          dispatch({ type: 'SET_SYNC_STATUS', payload: 'error' });
          logBackup({ id: generateId(), timestamp: Date.now(), type: 'full', action: 'upload', status: 'failure', file: 'D1 Sync', message: e?.message || '同步失败' });
          if (reason === 'manual') alert('Sync failed: ' + (e?.message || 'unknown error'));
          setSyncDirty(true);
      }
  }, [isDBLoaded, mergeFromCloud]);

  useEffect(() => {
      if (!syncDirty) return;
      const { syncEndpoint, syncToken } = state.settings;
      if (!syncEndpoint || !syncToken || !state.isOnline) return;
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      syncTimerRef.current = setTimeout(() => performCloudSync('auto'), 15000);
      return () => { if (syncTimerRef.current) clearTimeout(syncTimerRef.current); };
  }, [syncDirty, state.settings, state.isOnline, performCloudSync]);

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
          dispatch({ type: 'UPDATE_SETTINGS', payload: { lastBackupTime: now } });
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
      if (data.transactions) db.transactions.bulkPut(data.transactions.map(t => ({...t, isDeleted: false, updatedAt: Date.now()})));
      if (data.ledgers) db.ledgers.bulkPut(data.ledgers.map(l => ({...l, isDeleted: false, updatedAt: Date.now()})));
      if (data.categories) db.categories.bulkPut(data.categories.map(c => ({...c, isDeleted: false, updatedAt: Date.now()})));
      setSyncDirty(true);
  };

  const smartImportCsv = (csvContent: string, targetLedgerId: string = state.currentLedgerId) => {
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
          parsedTxs.forEach(tx => {
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
              addTransaction(normalized);
          });

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
  const restoreFromD1 = async () => {
      const { syncEndpoint, syncToken, syncUserId } = stateRef.current.settings;
      if (!syncEndpoint || !syncToken) {
          throw new Error('请先在设置里填写同步地址和 AUTH_TOKEN');
      }
      dispatch({ type: 'SET_SYNC_STATUS', payload: 'syncing' });
      try {
          const pulled = await pullFromCloud(syncEndpoint, syncToken, syncUserId || 'default', 0);
          await mergeFromCloud(pulled);
          dispatch({ type: 'UPDATE_SETTINGS', payload: { lastSyncVersion: pulled.version } });
          logBackup({ id: generateId(), timestamp: Date.now(), type: 'full', action: 'download', status: 'success', file: 'D1 Sync', message: '仅拉取恢复成功' });
          dispatch({ type: 'SET_SYNC_STATUS', payload: 'success' });
          setTimeout(() => dispatch({ type: 'SET_SYNC_STATUS', payload: 'idle' }), 2000);
      } catch (e: any) {
          logBackup({ id: generateId(), timestamp: Date.now(), type: 'full', action: 'download', status: 'failure', file: 'D1 Sync', message: e?.message || '恢复失败' });
          dispatch({ type: 'SET_SYNC_STATUS', payload: 'error' });
          setSyncDirty(true);
          throw e;
      }
  };

  // Reset app: clear local DB, wipe sync/webdav config, go back to first-run
  const resetApp = async () => {
      if (!window.confirm('确认要退出并清空本地数据吗？这将删除本地账本/分类/流水、清除云同步和 WebDAV 配置，恢复为首次启动状态。')) return;
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      // 清空本地表
      await Promise.all([
          db.ledgers.clear(),
          db.categories.clear(),
          db.transactions.clear(),
          db.settings.clear(),
          db.operationLogs.clear(),
          db.backupLogs.clear(),
      ]);
      // 重新播种默认数据
      const ledgerSeed = INITIAL_LEDGERS.map(l => ({ ...l, updatedAt: Date.now(), isDeleted: false }));
      const categorySeed = DEFAULT_CATEGORIES.map((c, idx) => ({ ...c, order: c.order ?? idx, updatedAt: Date.now(), isDeleted: false }));
      await db.ledgers.bulkPut(ledgerSeed);
      await db.categories.bulkPut(categorySeed);
      await db.settings.put({ key: 'main', value: { ...DEFAULT_SETTINGS, isFirstRun: true, syncEndpoint: '', syncToken: '', syncUserId: 'default', webdavUrl: '', webdavUser: '', webdavPass: '', enableCloudSync: false, lastSyncVersion: 0 } });

      // 重置内存状态
      dispatch({
          type: 'RESTORE_DATA',
          payload: {
              ledgers: ledgerSeed,
              categories: categorySeed,
              transactions: [],
              settings: { ...DEFAULT_SETTINGS, isFirstRun: true },
              currentLedgerId: ledgerSeed[0]?.id || INITIAL_LEDGERS[0].id,
              operationLogs: [],
              backupLogs: [],
              syncStatus: 'idle'
          }
      });
      setSyncDirty(false);
      setUndoStack(null);
      alert('已退出并清空本地数据，回到初次使用状态。');
  };

  if (!isDBLoaded) return null; // Or loading spinner

  return (
    <AppContext.Provider value={{ state, dispatch: enhancedDispatch, addTransaction, updateTransaction, deleteTransaction, batchDeleteTransactions, batchUpdateTransactions, undo, canUndo: !!undoStack, manualBackup, manualCloudSync, importData, smartImportCsv, restoreFromCloud, resetApp, restoreFromD1 }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => useContext(AppContext);










