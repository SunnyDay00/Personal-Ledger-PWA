
export type ThemeMode = 'light' | 'dark' | 'auto';
export type TransactionType = 'expense' | 'income';
export type BudgetType = 'week' | 'month' | 'year';

export interface Ledger {
  id: string;
  name: string;
  themeColor: string; // Hex code
  createdAt: number;
  updatedAt?: number;
  isDeleted?: boolean; // Soft delete
}

export interface Category {
  id: string;
  ledgerId?: string; // Optional for migration compatibility, but should be set
  name: string;
  icon: string; // Lucide icon name
  type: TransactionType;
  isCustom?: boolean;
  order: number;
  updatedAt?: number;
  isDeleted?: boolean;
}

export interface CategoryGroup {
  id: string;
  ledgerId?: string; // Optional for migration compatibility, but should be set
  name: string;
  categoryIds: string[];
  order: number;
  updatedAt?: number;
  isDeleted?: boolean;
}

export interface Transaction {
  id: string;
  ledgerId: string;
  amount: number;
  type: TransactionType;
  categoryId: string;
  date: number; // Timestamp
  note: string;
  createdAt: number;
  updatedAt?: number; // Crucial for sync
  isDeleted?: boolean; // Soft delete
}

export interface OperationLog {
  id: string;
  type: 'add' | 'edit' | 'delete' | 'restore' | 'import' | 'export';
  timestamp: number;
  ledgerId: string;
  targetId: string; // Transaction ID or "System"
  details?: string;
}

export interface BackupLog {
  id: string;
  timestamp: number;
  type: 'settings' | 'ledgers' | 'ledger_csv' | 'full' | 'restore';
  action: 'upload' | 'download';
  status: 'success' | 'failure';
  file?: string;
  message?: string;
}

export interface BudgetTarget {
  expense: number;
  income: number;
}

export interface BudgetConfig {
  enabled: boolean;
  displayType: BudgetType; // What to show on home
  notifyThreshold: number; // Percentage 0-100
  targets: {
    week: BudgetTarget;
    month: BudgetTarget;
    year: BudgetTarget;
  };
}

export interface UpdateLog {
  version: string;
  date: string;
  content: string[];
}

export interface AppSettings {
  themeMode: ThemeMode;
  customThemeColor: string;
  enableAnimations: boolean;
  enableSound: boolean;
  enableHaptics: boolean;
  hapticStrength: number; // 0=Off, 1=Light, 2=Medium, 3=Heavy
  
  // WebDAV
  webdavUrl: string;
  webdavUser: string;
  webdavPass: string;
  enableCloudSync: boolean; // New safety switch
  backupReminderDays?: number;
  backupAutoEnabled?: boolean;
  backupIntervalDays?: number;
  // Sync intervals
  syncDebounceSeconds?: number; // delay before auto sync after local change
  versionCheckIntervalFg?: number; // foreground version poll interval
  versionCheckIntervalBg?: number; // background version poll interval
  
  // Budget
  budget: BudgetConfig;
  
  // UI
  keypadHeight: number; // percentage (20-60)
  categoryRows: number; // items per row (4-6)
  
  // Data
  categoryNotes: Record<string, string[]>; // Category ID -> List of recent notes
  searchHistory: string[];
  
  // Meta
  lastBackupTime?: number;
  syncEndpoint?: string;
  syncToken?: string;
  lastSyncVersion?: number;
  syncUserId?: string;
  defaultLedgerId?: string;
  isFirstRun: boolean;
  exportStartDate?: string;
  exportEndDate?: string;
  
  // Version
  version: string;
  
  // Debug
  debugMode?: boolean;
}

export interface AppState {
  ledgers: Ledger[];
  transactions: Transaction[];
  categories: Category[];
  categoryGroups: CategoryGroup[];
  settings: AppSettings;
  currentLedgerId: string;
  currentDate: number;
  timeRange: 'week' | 'month' | 'year';
  operationLogs: OperationLog[];
  backupLogs: BackupLog[];
  updateLogs: UpdateLog[]; // Static or dynamic
  syncStatus: 'idle' | 'syncing' | 'success' | 'error';
  isOnline: boolean;
}

export type AppAction =
  | { type: 'SET_LEDGER'; payload: string }
  | { type: 'SET_CURRENT_DATE'; payload: number }
  | { type: 'SET_TIME_RANGE'; payload: 'week' | 'month' | 'year' }
  | { type: 'ADD_TRANSACTION'; payload: Transaction }
  | { type: 'UPDATE_TRANSACTION'; payload: Transaction }
  | { type: 'DELETE_TRANSACTION'; payload: string }
  | { type: 'BATCH_DELETE_TRANSACTIONS'; payload: string[] }
  | { type: 'BATCH_UPDATE_TRANSACTIONS'; payload: { ids: string[]; updates: Partial<Transaction> } }
  | { type: 'RESTORE_TRANSACTION'; payload: Transaction }
  | { type: 'ADD_CATEGORY_GROUP'; payload: CategoryGroup }
  | { type: 'UPDATE_CATEGORY_GROUP'; payload: CategoryGroup }
  | { type: 'DELETE_CATEGORY_GROUP'; payload: string }
  | { type: 'REORDER_CATEGORY_GROUPS'; payload: CategoryGroup[] }
  | { type: 'ADD_LEDGER'; payload: Ledger }
  | { type: 'UPDATE_LEDGER'; payload: Ledger }
  | { type: 'DELETE_LEDGER'; payload: string }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<AppSettings> }
  | { type: 'ADD_OPERATION_LOG'; payload: OperationLog }
  | { type: 'ADD_BACKUP_LOG'; payload: BackupLog }
  | { type: 'SET_SYNC_STATUS'; payload: AppState['syncStatus'] }
  | { type: 'SET_ONLINE_STATUS'; payload: boolean }
  | { type: 'RESTORE_DATA'; payload: Partial<AppState> }
  | { type: 'SET_THEME_MODE'; payload: ThemeMode }
  | { type: 'ADD_SEARCH_HISTORY'; payload: string }
  | { type: 'CLEAR_SEARCH_HISTORY' }
  | { type: 'COMPLETE_ONBOARDING' }
  | { type: 'ADD_CATEGORY'; payload: Category }
  | { type: 'UPDATE_CATEGORY'; payload: Category }
  | { type: 'DELETE_CATEGORY'; payload: string }
  | { type: 'REORDER_CATEGORIES'; payload: Category[] }
  | { type: 'SAVE_NOTE_HISTORY'; payload: { categoryId: string; note: string } };

export interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  addTransaction: (transaction: Transaction) => void;
  updateTransaction: (transaction: Transaction) => void;
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
  addLedger: (ledger: Ledger) => Promise<void>;
}
