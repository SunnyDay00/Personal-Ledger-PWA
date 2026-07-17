import { Category, CategoryType, CurrencyCode, Ledger, AppSettings } from './types';
import { createDefaultAiConfig } from './services/aiConfig';

export const DEFAULT_THEME_COLOR = '#007AFF';
export const FIXED_SYNC_ENDPOINT = 'https://sync.sssr.edu.kg';
export const DEFAULT_CURRENCY: CurrencyCode = 'CNY';

export const SUPPORTED_CURRENCIES: Array<{ code: CurrencyCode; name: string }> = [
  { code: 'CNY', name: '人民币' },
  { code: 'USD', name: '美元' },
  { code: 'EUR', name: '欧元' },
  { code: 'JPY', name: '日元' },
  { code: 'KRW', name: '韩元' },
  { code: 'TRY', name: '土耳其里拉' },
  { code: 'GBP', name: '英镑' },
  { code: 'HKD', name: '港币' },
  { code: 'TWD', name: '新台币' },
  { code: 'MOP', name: '澳门元' },
  { code: 'SGD', name: '新加坡元' },
  { code: 'MYR', name: '马来西亚林吉特' },
  { code: 'THB', name: '泰铢' },
  { code: 'VND', name: '越南盾' },
  { code: 'IDR', name: '印尼盾' },
  { code: 'PHP', name: '菲律宾比索' },
  { code: 'INR', name: '印度卢比' },
  { code: 'PKR', name: '巴基斯坦卢比' },
  { code: 'BDT', name: '孟加拉塔卡' },
  { code: 'LKR', name: '斯里兰卡卢比' },
  { code: 'NPR', name: '尼泊尔卢比' },
  { code: 'AUD', name: '澳大利亚元' },
  { code: 'NZD', name: '新西兰元' },
  { code: 'CAD', name: '加拿大元' },
  { code: 'MXN', name: '墨西哥比索' },
  { code: 'BRL', name: '巴西雷亚尔' },
  { code: 'ARS', name: '阿根廷比索' },
  { code: 'CLP', name: '智利比索' },
  { code: 'COP', name: '哥伦比亚比索' },
  { code: 'PEN', name: '秘鲁索尔' },
  { code: 'CHF', name: '瑞士法郎' },
  { code: 'SEK', name: '瑞典克朗' },
  { code: 'NOK', name: '挪威克朗' },
  { code: 'DKK', name: '丹麦克朗' },
  { code: 'PLN', name: '波兰兹罗提' },
  { code: 'CZK', name: '捷克克朗' },
  { code: 'HUF', name: '匈牙利福林' },
  { code: 'RON', name: '罗马尼亚列伊' },
  { code: 'BGN', name: '保加利亚列弗' },
  { code: 'RUB', name: '俄罗斯卢布' },
  { code: 'UAH', name: '乌克兰格里夫纳' },
  { code: 'KZT', name: '哈萨克斯坦坚戈' },
  { code: 'AED', name: '阿联酋迪拉姆' },
  { code: 'SAR', name: '沙特里亚尔' },
  { code: 'QAR', name: '卡塔尔里亚尔' },
  { code: 'KWD', name: '科威特第纳尔' },
  { code: 'BHD', name: '巴林第纳尔' },
  { code: 'OMR', name: '阿曼里亚尔' },
  { code: 'ILS', name: '以色列新谢克尔' },
  { code: 'EGP', name: '埃及镑' },
  { code: 'ZAR', name: '南非兰特' },
  { code: 'MAD', name: '摩洛哥迪拉姆' },
  { code: 'NGN', name: '尼日利亚奈拉' },
  { code: 'KES', name: '肯尼亚先令' },
  { code: 'MMK', name: '缅甸元' },
  { code: 'LAK', name: '老挝基普' },
  { code: 'KHR', name: '柬埔寨瑞尔' },
  { code: 'MNT', name: '蒙古图格里克' },
  { code: 'GEL', name: '格鲁吉亚拉里' },
  { code: 'AMD', name: '亚美尼亚德拉姆' },
  { code: 'AZN', name: '阿塞拜疆马纳特' },
];

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
  authMode: 'guest',
  authSession: undefined,
  lastSyncVersion: 0,
  settingsUpdatedAt: 0,
  lastAutoBackupTime: 0,
  exportStartDate: '',
  exportEndDate: '',
  isFirstRun: true,
  version: '7.6.6',
  debugMode: typeof localStorage !== 'undefined' ? localStorage.getItem('debugMode') === 'true' : false,
  defaultLedgerId: '',
  homeQuickActions: [],
  autoRecords: [],
  aiConfig: createDefaultAiConfig(),
};

export const INITIAL_LEDGERS: Ledger[] = [
  { id: 'l1', name: '个人生活', themeColor: '#007AFF', ledgerType: 'accounting', displayCurrency: DEFAULT_CURRENCY, createdAt: Date.now() },
];

export const DEFAULT_CATEGORY_GROUPS = [];

// Helper to create category list easily
const createCats = (type: CategoryType, list: string[], startIndex: number): Category[] => {
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

export const DEFAULT_TRADE_CATEGORIES: Category[] = [
  { id: 'trade_default_0', name: '商品', icon: 'Package', type: 'trade', order: 0, isCustom: false, buyFeeRate: 0, sellFeeRate: 0, buyCurrency: DEFAULT_CURRENCY, sellCurrency: DEFAULT_CURRENCY, updatedAt: Date.now(), isDeleted: false },
  { id: 'trade_default_1', name: '原料', icon: 'Boxes', type: 'trade', order: 1, isCustom: false, buyFeeRate: 0, sellFeeRate: 0, buyCurrency: DEFAULT_CURRENCY, sellCurrency: DEFAULT_CURRENCY, updatedAt: Date.now(), isDeleted: false },
  { id: 'trade_default_2', name: '其他', icon: 'MoreHorizontal', type: 'trade', order: 2, isCustom: false, buyFeeRate: 0, sellFeeRate: 0, buyCurrency: DEFAULT_CURRENCY, sellCurrency: DEFAULT_CURRENCY, updatedAt: Date.now(), isDeleted: false },
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
  'Dumbbell', 'Trophy', 'Medal', 'Music', 'Video', 'Palette', 'Brush', 'Tent',
  // Misc
  'MoreHorizontal', 'Circle', 'Star', 'Crown', 'Ghost', 'Smile', 'Settings', 'Search', 'Bell', 'Calendar', 'Clock'
];
