import { Category, Ledger, AppSettings } from './types';

export const DEFAULT_THEME_COLOR = '#007AFF';

export const DEFAULT_SETTINGS: AppSettings = {
  themeMode: 'auto',
  customThemeColor: DEFAULT_THEME_COLOR,
  enableAnimations: false,
  enableSound: true,
  webdavUrl: '',
  webdavUser: '',
  webdavPass: '',
  enableCloudSync: false, // Default off for safety
  backupReminderDays: 7,
  backupAutoEnabled: false,
  backupIntervalDays: 7,
  syncDebounceSeconds: 3,
  versionCheckIntervalFg: 10,
  versionCheckIntervalBg: 20,
  budget: {
    enabled: false,
    displayType: 'month',
    notifyThreshold: 80,
    targets: {
      week: { expense: 1000, income: 0 },
      month: { expense: 5000, income: 0 },
      year: { expense: 60000, income: 0 }
    }
  },
  keypadHeight: 40, // 40vh
  categoryRows: 5,
  categoryNotes: {}, // Init note history
  searchHistory: [],
  syncEndpoint: '',
  syncToken: '',
  syncUserId: 'default',
  lastSyncVersion: 0,
  exportStartDate: '',
  exportEndDate: '',
  isFirstRun: true,
  version: '2.0.0',
};

export const INITIAL_LEDGERS: Ledger[] = [
  { id: 'l1', name: '个人生活', themeColor: '#007AFF', createdAt: Date.now() },
];

// Helper to create category list easily
const createCats = (type: 'expense' | 'income', list: string[], startIndex: number): Category[] => {
  const iconMap: Record<string, string> = {
    '餐饮': 'Utensils', '买菜': 'Carrot', '零食': 'IceCream', '日用': 'ShoppingBag',
    '数码': 'Smartphone', '娱乐': 'Gamepad2', '服饰': 'Shirt', '游玩': 'Plane',
    '教育': 'GraduationCap', 'AI': 'Cpu', '网络': 'Wifi', '社保': 'Shield',
    '理发': 'Scissors', '保险': 'Umbrella', '出行': 'Car', '其他': 'MoreHorizontal',
    '工资': 'Wallet', '兼职': 'Briefcase', '理财': 'TrendingUp', '他人': 'Users',
  };

  return list.map((name, idx) => ({
    id: `${type}_${startIndex + idx}`,
    name,
    icon: iconMap[name] || 'Circle',
    type,
    order: idx,
    isCustom: false
  }));
};

export const DEFAULT_CATEGORIES: Category[] = [
  ...createCats('expense', [
    '餐饮', '买菜', '零食', '日用', '数码', '娱乐', '服饰', '游玩', 
    '教育', 'AI', '网络', '社保', '理发', '保险', '出行', '其他'
  ], 0),
  ...createCats('income', [
    '工资', '兼职', '理财', '他人', '其他'
  ], 0)
];

export const THEME_PRESETS = [
  '#007AFF', // Blue
  '#FF9500', // Orange
  '#34C759', // Green
  '#AF52DE', // Purple
  '#FF2D55', // Pink
  '#5856D6', // Indigo
  '#5AC8FA', // Teal
  '#FFCC00', // Yellow
];

export const AVAILABLE_ICONS = [
  // Food & Drink
  'Utensils', 'Carrot', 'IceCream', 'Coffee', 'Beer', 'Wine', 'Pizza', 'Sandwich', 'Apple', 'Banana', 'Croissant', 'Cake',
  // Shopping
  'ShoppingBag', 'ShoppingCart', 'Gift', 'CreditCard', 'Tag', 'Watch', 'Glasses', 'Gem',
  // Tech
  'Smartphone', 'Gamepad2', 'Cpu', 'Wifi', 'Laptop', 'Monitor', 'Headphones', 'Speaker', 'Camera', 'Battery', 'Server',
  // Transport
  'Car', 'Plane', 'Bike', 'Bus', 'Train', 'Ship', 'Map', 'Navigation', 'Anchor', 'Rocket', 'Fuel',
  // Life & Health
  'Home', 'Umbrella', 'Scissors', 'Shield', 'Key', 'Stethoscope', 'Pill', 'Thermometer', 'Heart', 'Activity', 'Baby', 'Bed', 'Bath',
  // Education & Work
  'GraduationCap', 'Briefcase', 'Book', 'PenTool', 'Calculator', 'Printer', 'FileText', 'Archive', 'Award',
  // Income & Money
  'Wallet', 'TrendingUp', 'DollarSign', 'Coins', 'PiggyBank', 'Banknote', 'Safe', 'Bitcoin',
  // Nature & Pets
  'Sun', 'Moon', 'Cloud', 'Zap', 'Droplet', 'Flame', 'TreeDeciduous', 'Flower', 'Dog', 'Cat', 'Fish', 'Bird', 'PawPrint',
  // Sports & Hobbies
  'Dumbbell', 'Bike', 'Trophy', 'Medal', 'Music', 'Video', 'Palette', 'Brush', 'Tent',
  // Misc
  'MoreHorizontal', 'Circle', 'Star', 'Crown', 'Ghost', 'Smile', 'Settings', 'Search', 'Bell', 'Calendar', 'Clock'
];
