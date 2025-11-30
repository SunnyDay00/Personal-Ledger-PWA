import { UpdateLog } from './types';

export const UPDATE_LOGS: UpdateLog[] = [
  {
      version: '3.1.0',
      date: '2025/11/30',
      content: [
          '优化D1+KV云端同步逻辑。 仅推送 updatedAt 大于 “上次同步版本”（lastSyncVersion）的记录（含删除标记），手动同步则 push 全部。',
          '自动同步用 since=lastSyncVersion 增量拉取；手动同步用 since=0 全量校准。',
          '合并时按 updatedAt（或服务器返回的 updated_at）取新者；如果记录带 is_deleted，则强制覆盖本地，防止删除被旧数据复活。',
          '减少云端写入数据库的数据。',
          '添加探测云端数据版本的功能。',
          '版本探测、同步延时，添加成软件可配置项，可手动调节。',
          '优化界面细节'
      ]
  },
  {
      version: '3.0.0',
      date: '2025/11/29',
      content: [
          '重大更新！ ',
          '数据云端同步架构更改为使用cloudflare的D1+KV的方式。',
          'WEDDEV云盘作为手动备份，可以设置提醒、定期备份。',
          '添加退出登录功能，恢复软件初始状态。',
          '优化界面。',
          '更新应用图标'
      ]
  },
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