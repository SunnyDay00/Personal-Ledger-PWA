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
  categoryGroupVisibility: {},
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
  version: '7.7.1',
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

export const CATEGORY_ICON_GROUPS = [
  {
    id: 'food', label: '餐饮美食',
    icons: [
      { name: 'Utensils', label: '餐具' },
      { name: 'Carrot', label: '胡萝卜' },
      { name: 'IceCream', label: '冰淇淋' },
      { name: 'Coffee', label: '咖啡' },
      { name: 'Beer', label: '啤酒' },
      { name: 'Wine', label: '葡萄酒' },
      { name: 'Pizza', label: '披萨' },
      { name: 'Sandwich', label: '三明治' },
      { name: 'Apple', label: '苹果' },
      { name: 'Banana', label: '香蕉' },
      { name: 'Croissant', label: '牛角包' },
      { name: 'Cake', label: '蛋糕' },
      { name: 'Cherry', label: '樱桃' },
      { name: 'Grape', label: '葡萄' },
      { name: 'Citrus', label: '柑橘' },
      { name: 'Soup', label: '汤' },
      { name: 'Beef', label: '牛肉' },
      { name: 'Egg', label: '鸡蛋' },
      { name: 'Milk', label: '牛奶' },
      { name: 'Cookie', label: '饼干' },
    ],
  },
  {
    id: 'shopping', label: '购物服饰',
    icons: [
      { name: 'ShoppingBag', label: '购物袋' },
      { name: 'ShoppingCart', label: '购物车' },
      { name: 'Gift', label: '礼物' },
      { name: 'CreditCard', label: '银行卡' },
      { name: 'Tag', label: '标签' },
      { name: 'Watch', label: '手表' },
      { name: 'Glasses', label: '眼镜' },
      { name: 'Gem', label: '宝石' },
      { name: 'Shirt', label: '衣服' },
      { name: 'ShoppingBasket', label: '购物篮' },
      { name: 'Store', label: '商店' },
    ],
  },
  {
    id: 'tech', label: '数码产品',
    icons: [
      { name: 'Smartphone', label: '手机' },
      { name: 'Gamepad2', label: '游戏手柄' },
      { name: 'Cpu', label: '处理器' },
      { name: 'Wifi', label: '无线网络' },
      { name: 'Laptop', label: '笔记本电脑' },
      { name: 'Monitor', label: '显示器' },
      { name: 'Headphones', label: '耳机' },
      { name: 'Speaker', label: '音箱' },
      { name: 'Camera', label: '相机' },
      { name: 'Battery', label: '电池' },
      { name: 'Server', label: '服务器' },
      { name: 'Tablet', label: '平板电脑' },
      { name: 'Keyboard', label: '键盘' },
      { name: 'Mouse', label: '鼠标' },
      { name: 'Usb', label: 'USB' },
      { name: 'Router', label: '路由器' },
      { name: 'Tv', label: '电视' },
      { name: 'HardDrive', label: '硬盘' },
      { name: 'Webcam', label: '摄像头' },
    ],
  },
  {
    id: 'transport', label: '交通工具',
    icons: [
      { name: 'Car', label: '汽车' },
      { name: 'Plane', label: '飞机' },
      { name: 'Bike', label: '自行车' },
      { name: 'Bus', label: '公交车' },
      { name: 'Train', label: '电车' },
      { name: 'Ship', label: '轮船' },
      { name: 'Map', label: '地图' },
      { name: 'Navigation', label: '导航' },
      { name: 'Anchor', label: '船锚' },
      { name: 'Rocket', label: '火箭' },
      { name: 'Fuel', label: '加油' },
      { name: 'Truck', label: '卡车' },
      { name: 'Ambulance', label: '救护车' },
      { name: 'Sailboat', label: '帆船' },
      { name: 'TrainFront', label: '火车' },
      { name: 'Tractor', label: '拖拉机' },
    ],
  },
  {
    id: 'life', label: '生活健康',
    icons: [
      { name: 'Home', label: '家' },
      { name: 'Scissors', label: '剪刀' },
      { name: 'Shield', label: '防护' },
      { name: 'Key', label: '钥匙' },
      { name: 'Stethoscope', label: '听诊器' },
      { name: 'Pill', label: '药片' },
      { name: 'Thermometer', label: '体温计' },
      { name: 'Heart', label: '爱心' },
      { name: 'Activity', label: '健康' },
      { name: 'Baby', label: '婴儿' },
      { name: 'Bed', label: '床' },
      { name: 'Bath', label: '浴缸' },
      { name: 'Sofa', label: '沙发' },
      { name: 'WashingMachine', label: '洗衣机' },
      { name: 'Refrigerator', label: '冰箱' },
      { name: 'Wrench', label: '维修' },
      { name: 'Syringe', label: '注射器' },
    ],
  },
  {
    id: 'work', label: '学习办公',
    icons: [
      { name: 'GraduationCap', label: '毕业帽' },
      { name: 'Briefcase', label: '公文包' },
      { name: 'Book', label: '书本' },
      { name: 'PenTool', label: '钢笔' },
      { name: 'Calculator', label: '计算器' },
      { name: 'Printer', label: '打印机' },
      { name: 'FileText', label: '文档' },
      { name: 'Archive', label: '归档' },
      { name: 'Award', label: '奖章' },
      { name: 'Notebook', label: '笔记本' },
      { name: 'School', label: '学校' },
      { name: 'Library', label: '图书馆' },
      { name: 'Boxes', label: '箱子' },
    ],
  },
  {
    id: 'money', label: '收入金融',
    icons: [
      { name: 'Wallet', label: '钱包' },
      { name: 'TrendingUp', label: '增长' },
      { name: 'DollarSign', label: '货币' },
      { name: 'Coins', label: '硬币' },
      { name: 'PiggyBank', label: '储蓄罐' },
      { name: 'Banknote', label: '纸币' },
      { name: 'Safe', label: '保险箱' },
      { name: 'Bitcoin', label: '比特币' },
      { name: 'Landmark', label: '银行' },
      { name: 'Receipt', label: '收据' },
    ],
  },
  {
    id: 'animals', label: '动物',
    icons: [
      { name: 'Dog', label: '狗' },
      { name: 'Cat', label: '猫' },
      { name: 'Fish', label: '鱼' },
      { name: 'Bird', label: '鸟' },
      { name: 'PawPrint', label: '爪印' },
      { name: 'Rabbit', label: '兔子' },
      { name: 'Turtle', label: '乌龟' },
      { name: 'Bug', label: '昆虫' },
      { name: 'Squirrel', label: '松鼠' },
      { name: 'Snail', label: '蜗牛' },
      { name: 'Rat', label: '老鼠' },
      { name: 'Shell', label: '贝壳' },
    ],
  },
  {
    id: 'plants', label: '植物',
    icons: [
      { name: 'TreeDeciduous', label: '阔叶树' },
      { name: 'Flower', label: '花朵' },
      { name: 'Flower2', label: '鲜花' },
      { name: 'Leaf', label: '叶子' },
      { name: 'Sprout', label: '幼苗' },
      { name: 'Trees', label: '树林' },
      { name: 'TreePine', label: '松树' },
      { name: 'Wheat', label: '麦穗' },
      { name: 'Shrub', label: '灌木' },
      { name: 'Clover', label: '三叶草' },
    ],
  },
  {
    id: 'weather', label: '天气',
    icons: [
      { name: 'Sun', label: '太阳' },
      { name: 'Moon', label: '月亮' },
      { name: 'Cloud', label: '云' },
      { name: 'Umbrella', label: '雨伞' },
      { name: 'CloudRain', label: '下雨' },
      { name: 'CloudSnow', label: '下雪' },
      { name: 'CloudSun', label: '多云' },
      { name: 'CloudLightning', label: '雷雨' },
      { name: 'Snowflake', label: '雪花' },
      { name: 'Wind', label: '风' },
      { name: 'Sunrise', label: '日出' },
      { name: 'Sunset', label: '日落' },
      { name: 'Rainbow', label: '彩虹' },
      { name: 'Tornado', label: '龙卷风' },
    ],
  },
  {
    id: 'nature', label: '水火自然',
    icons: [
      { name: 'Droplet', label: '水滴' },
      { name: 'Flame', label: '火焰' },
      { name: 'Zap', label: '闪电' },
      { name: 'Droplets', label: '水珠' },
      { name: 'Waves', label: '波浪' },
      { name: 'FlameKindling', label: '篝火' },
      { name: 'Mountain', label: '山峰' },
      { name: 'MountainSnow', label: '雪山' },
      { name: 'Earth', label: '地球' },
    ],
  },
  {
    id: 'hobbies', label: '运动娱乐',
    icons: [
      { name: 'Dumbbell', label: '哑铃' },
      { name: 'Trophy', label: '奖杯' },
      { name: 'Medal', label: '奖牌' },
      { name: 'Music', label: '音乐' },
      { name: 'Video', label: '视频' },
      { name: 'Palette', label: '调色盘' },
      { name: 'Brush', label: '画笔' },
      { name: 'Tent', label: '帐篷' },
      { name: 'Footprints', label: '步行' },
      { name: 'Drum', label: '鼓' },
      { name: 'Guitar', label: '吉他' },
      { name: 'Film', label: '电影' },
    ],
  },
  {
    id: 'other', label: '通用',
    icons: [
      { name: 'MoreHorizontal', label: '更多' },
      { name: 'Circle', label: '圆形' },
      { name: 'Star', label: '星星' },
      { name: 'Crown', label: '王冠' },
      { name: 'Ghost', label: '幽灵' },
      { name: 'Smile', label: '笑脸' },
      { name: 'Settings', label: '设置' },
      { name: 'Search', label: '搜索' },
      { name: 'Bell', label: '铃铛' },
      { name: 'Calendar', label: '日历' },
      { name: 'Clock', label: '时钟' },
      { name: 'Flag', label: '旗帜' },
      { name: 'Puzzle', label: '拼图' },
    ],
  },
];

// Keep the flat list for other existing icon selectors.
export const AVAILABLE_ICONS = CATEGORY_ICON_GROUPS.flatMap(group => group.icons.map(icon => icon.name));
