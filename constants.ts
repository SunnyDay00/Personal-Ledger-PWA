import { Category, Ledger, AppSettings } from './types';

export const DEFAULT_THEME_COLOR = '#007AFF';

export const DEFAULT_SETTINGS: AppSettings = {
  themeMode: 'auto',
  customThemeColor: DEFAULT_THEME_COLOR,
  enableAnimations: false,
  enableSound: true,
  enableHaptics: true,
  hapticStrength: 2,
  fontContrast: 'normal',
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
  debugMode: typeof localStorage !== 'undefined' ? localStorage.getItem('debugMode') === 'true' : false,
  defaultLedgerId: '',
};

export const INITIAL_LEDGERS: Ledger[] = [
  { id: 'l1', name: '个人生活', themeColor: '#007AFF', createdAt: Date.now() },
];

export const DEFAULT_CATEGORY_GROUPS = [];

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
  // 餐饮
  { name: '餐饮', icon: 'Coffee', type: 'expense' }, { name: '早餐', icon: 'Coffee', type: 'expense' }, { name: '午餐', icon: 'Pizza', type: 'expense' }, { name: '晚餐', icon: 'Utensils', type: 'expense' }, { name: '饮料', icon: 'Cup', type: 'expense' }, { name: '零食', icon: 'IceCream', type: 'expense' }, { name: '买菜', icon: 'Carrot', type: 'expense' }, { name: '外卖', icon: 'Truck', type: 'expense' },
  // 购物
  { name: '购物', icon: 'ShoppingBag', type: 'expense' }, { name: '日用', icon: 'ShoppingBag', type: 'expense' }, { name: '数码', icon: 'Smartphone', type: 'expense' }, { name: '衣服', icon: 'Shirt', type: 'expense' }, { name: '家居', icon: 'Home', type: 'expense' }, { name: '美妆', icon: 'Smile', type: 'expense' }, { name: '电器', icon: 'Tv', type: 'expense' },
  // 交通
  { name: '交通', icon: 'Train', type: 'expense' }, { name: '打车', icon: 'Car', type: 'expense' }, { name: '公交', icon: 'Bus', type: 'expense' }, { name: '地铁', icon: 'Train', type: 'expense' }, { name: '加油', icon: 'Droplet', type: 'expense' }, { name: '停车', icon: 'MapPin', type: 'expense' }, { name: '维修', icon: 'Tool', type: 'expense' },
  // 娱乐
  { name: '娱乐', icon: 'Film', type: 'expense' }, { name: '电影', icon: 'Film', type: 'expense' }, { name: '游戏', icon: 'Gamepad', type: 'expense' }, { name: '会员', icon: 'CreditCard', type: 'expense' }, { name: '旅游', icon: 'Map', type: 'expense' }, { name: '聚会', icon: 'Users', type: 'expense' }, { name: '宠物', icon: 'Github', type: 'expense' },
  // 居住
  { name: '居住', icon: 'Home', type: 'expense' }, { name: '房租', icon: 'Key', type: 'expense' }, { name: '水电', icon: 'Zap', type: 'expense' }, { name: '宽带', icon: 'Wifi', type: 'expense' }, { name: '物业', icon: 'Shield', type: 'expense' }, { name: '话费', icon: 'Phone', type: 'expense' },
  // 医疗
  { name: '医疗', icon: 'Activity', type: 'expense' }, { name: '药品', icon: 'Thermometer', type: 'expense' }, { name: '体检', icon: 'Heart', type: 'expense' },
  // 教育
  { name: '教育', icon: 'Book', type: 'expense' }, { name: '书籍', icon: 'BookOpen', type: 'expense' }, { name: '培训', icon: 'PenTool', type: 'expense' },
  // 人情
  { name: '人情', icon: 'Gift', type: 'expense' }, { name: '红包', icon: 'Gift', type: 'expense' }, { name: '礼物', icon: 'Gift', type: 'expense' }, { name: '请客', icon: 'Users', type: 'expense' },
  // 投资
  { name: '投资', icon: 'TrendingUp', type: 'expense' }, { name: '理财亏损', icon: 'TrendingDown', type: 'expense' },
  // 其他
  { name: '其他', icon: 'MoreHorizontal', type: 'expense' }, { name: '丢失', icon: 'Frown', type: 'expense' },
  // 收入
  { name: '工资', icon: 'Briefcase', type: 'income' }, { name: '兼职', icon: 'Clock', type: 'income' }, { name: '理财收益', icon: 'TrendingUp', type: 'income' }, { name: '礼金', icon: 'Gift', type: 'income' }, { name: '奖金', icon: 'Award', type: 'income' }, { name: '报销', icon: 'FileText', type: 'income' }, { name: '其他收入', icon: 'PlusCircle', type: 'income' }
].map((c, idx) => ({
  id: `default_${idx}`, // Placeholder ID, will be overwritten
  name: c.name,
  icon: c.icon,
  type: c.type as any,
  order: idx,
  isCustom: false,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  isDeleted: false
}));

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
  'Dumbbell', 'Trophy', 'Medal', 'Music', 'Video', 'Palette', 'Brush', 'Tent',
  // Misc
  'MoreHorizontal', 'Circle', 'Star', 'Crown', 'Ghost', 'Smile', 'Settings', 'Search', 'Bell', 'Calendar', 'Clock'
];
