

import { Category, Ledger, AppSettings, UpdateLog } from './types';

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
  isFirstRun: true,
  version: '1.2.4',
};

export const INITIAL_LEDGERS: Ledger[] = [
  { id: 'l1', name: '个人生活', themeColor: '#007AFF', createdAt: Date.now() },
];

export const UPDATE_LOGS: UpdateLog[] = [
  {
      version: '1.2.4',
      date: new Date().toLocaleDateString(),
      content: [
          '新增添加账目时“快速备注”功能，自动记录常用备注',
          '优化云端备份警告提示',
          '更新应用图标'
      ]
  },
  {
    version: '1.2.3',
    date: '2023/11/20',
    content: [
        '新增云端同步安全开关，防止误覆盖数据',
        '新增本地导入/导出操作反馈与日志记录',
        '优化数据安全提示'
    ]
  },
  {
    version: '1.2.2',
    date: '2023/11/15',
    content: [
      '新增云端同步状态图标 (红/绿/蓝三色指示)',
      '点击同步图标可直接查看详细日志',
      '优化云端日志显示，区分上传与下载操作',
      '修复手动全量备份日志记录不完整的问题'
    ]
  },
  {
    version: '1.2.1',
    date: '2023/11/08',
    content: [
      '修复首次安装时云端恢复失败的问题',
      '优化云端备份日志，文件用途更清晰',
      '优化金额显示，支持智能隐藏小数位'
    ]
  },
  {
    version: '1.2.0',
    date: '2023/11/01',
    content: [
      '优化金额显示策略：整数不显示小数位，小数自动显示两位',
      '修复添加账目时小数点显示问题',
      '优化云端备份日志详情显示',
      '新增收入/支出饼图切换功能'
    ]
  },
  {
    version: '1.1.0',
    date: '2023/10/28',
    content: [
      'UI 界面优化，视觉更清爽',
      '记账勋章界面重构，数据展示更直观',
      '金额默认不显示小数位，界面更整洁'
    ]
  },
  {
    version: '1.0.0',
    date: '2023/10/24', 
    content: [
      '应用首发',
      '支持多账本管理',
      'iOS 风格液态视觉设计',
      'WebDAV 云端备份',
      '支持批量操作与分类管理',
      '多维度预算功能',
      '详细的记账勋章与统计'
    ]
  }
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