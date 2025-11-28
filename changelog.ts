import { UpdateLog } from './types';

export const UPDATE_LOGS: UpdateLog[] = [
  {
      version: '2.0.0',
      date: '2025/11/28',
      content: [
          '优化云端同步逻辑,本地数据库该为IndexedDB ',
          '优化云端同步账本CSV，拆分年份同步',
          '更新应用图标'
      ]
  },
  {
      version: '1.2.4',
      date: '2025/11/25',
      content: [
          '新增添加账目时“快速备注”功能，自动记录常用备注',
          '优化云端备份警告提示',
          '更新应用图标'
      ]
  },
  {
    version: '1.2.3',
    date: '2025/11/20',
    content: [
        '新增云端同步安全开关，防止误覆盖数据',
        '新增本地导入/导出操作反馈与日志记录',
        '优化数据安全提示'
    ]
  },
];