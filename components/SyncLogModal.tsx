import React from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../contexts/AppContext';
import { Icon } from './ui/Icon';
import { format } from 'date-fns';
import { clsx } from 'clsx';

export const SyncLogModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { state, dispatch } = useApp();
  const { settings } = state;
  const logs = state.backupLogs;

  const getLogTypeLabel = (type: string) => {
    switch (type) {
        case 'settings': return '配置与分类';
        case 'ledgers': return '账本列表';
        case 'ledger_csv': return '账本数据';
        case 'full': return '全量数据';
        case 'restore': return '数据恢复';
        default: return type;
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-[100] flex flex-col bg-ios-bg animate-slide-up">
      <div className="pt-[env(safe-area-inset-top)] px-4 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl border-b border-ios-border z-10 shrink-0">
        <div className="flex items-center justify-between h-14">
            <button onClick={onClose} className="p-2 -ml-2 text-ios-subtext text-base">关闭</button>
            <h1 className="font-semibold text-lg">云端同步日志</h1>
            <div className="w-10"></div>
        </div>
      </div>
      
      {/* Warning Banner for Disabled Sync */}
      {!settings.enableCloudSync && settings.webdavUrl && (
          <div className="bg-orange-50 dark:bg-orange-900/10 px-4 py-4 flex justify-between items-center border-b border-orange-100 dark:border-orange-900/30 shrink-0">
              <div className="flex items-center gap-2">
                  <Icon name="AlertTriangle" className="w-5 h-5 text-orange-500" />
                  <span className="text-sm text-orange-600 dark:text-orange-400 font-medium">自动同步未开启</span>
              </div>
              <button 
                onClick={() => {
                     // Check completeness before enabling
                     if(settings.webdavUrl && settings.webdavUser && settings.webdavPass) {
                         dispatch({ type: 'UPDATE_SETTINGS', payload: { enableCloudSync: true } });
                     } else {
                         alert("WebDAV 配置不完整，无法开启。");
                     }
                }}
                className="text-xs bg-orange-500 text-white px-4 py-2 rounded-lg font-bold shadow-sm active:opacity-80 transition-opacity"
              >
                  立即开启
              </button>
          </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 no-scrollbar pb-[calc(env(safe-area-inset-bottom)+2rem)]">
          {logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 opacity-50">
                  <Icon name="FileText" className="w-16 h-16 mb-4 text-ios-subtext" />
                  <p className="text-ios-subtext text-base">暂无同步记录</p>
              </div>
          ) : (
              <div className="bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden shadow-sm border border-ios-border">
                  {logs.slice(0, 50).map((log, i) => (
                      <div key={log.id} className="p-4 border-b border-gray-100 dark:border-zinc-800 last:border-0 flex items-start justify-between hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors">
                          <div className="flex items-start gap-4">
                              <div className={clsx(
                                  "mt-1.5 w-2.5 h-2.5 rounded-full shrink-0",
                                  log.status === 'success' ? 'bg-green-500' : 'bg-red-500'
                              )}></div>
                              <div>
                                  <div className="font-medium text-base flex items-center gap-2 mb-1">
                                      <span className={log.status === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                                          {log.action === 'download' ? '下载' : '上传'}
                                          {log.status === 'success' ? '成功' : '失败'}
                                      </span>
                                      <span className="text-ios-text/60 font-normal text-xs px-2 py-0.5 bg-gray-100 dark:bg-zinc-800 rounded-md">
                                          {getLogTypeLabel(log.type)}
                                      </span>
                                  </div>
                                  <div className="text-sm text-ios-subtext leading-relaxed break-all">
                                      {log.message || log.file || '无详细信息'}
                                  </div>
                              </div>
                          </div>
                          <span className="text-xs text-ios-subtext/70 tabular-nums whitespace-nowrap ml-4 mt-1">
                              {format(log.timestamp, 'MM-dd HH:mm')}
                          </span>
                      </div>
                  ))}
              </div>
          )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};