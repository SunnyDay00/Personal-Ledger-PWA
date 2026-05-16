import React, { useMemo, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { Icon } from './ui/Icon';
import { SyncLogModal } from './SyncLogModal';
import { clsx } from 'clsx';

export const CloudSyncButton: React.FC<{ className?: string; showLabel?: boolean }> = ({ className, showLabel = false }) => {
  const { state } = useApp();
  const { settings, syncStatus, backupLogs, isOnline, pendingSyncCount, lastSyncError } = state;
  const [showLog, setShowLog] = useState(false);
  const isAuthenticated = settings.authMode === 'authenticated' && !!settings.authSession?.token;

  const { icon, color, animate, statusLabel } = useMemo(() => {
    if (!isAuthenticated) {
      return { icon: 'Cloud', color: 'text-gray-300 dark:text-zinc-600', animate: false, statusLabel: '本地模式：数据仅保存在本机' };
    }
    if (!isOnline) {
      return {
        icon: 'WifiOff',
        color: 'text-orange-400',
        animate: false,
        statusLabel: pendingSyncCount > 0 ? `离线：${pendingSyncCount} 项待同步` : '离线：恢复联网后继续同步',
      };
    }
    if (syncStatus === 'syncing') {
      return { icon: 'RefreshCw', color: 'text-blue-500', animate: true, statusLabel: '正在同步' };
    }
    if (lastSyncError) {
      return {
        icon: 'CloudOff',
        color: 'text-red-500',
        animate: false,
        statusLabel: pendingSyncCount > 0 ? `同步失败：${lastSyncError}（${pendingSyncCount} 项待同步）` : `同步失败：${lastSyncError}`,
      };
    }
    if (pendingSyncCount > 0) {
      return { icon: 'CloudUpload', color: 'text-orange-500', animate: false, statusLabel: `${pendingSyncCount} 项待同步` };
    }
    const lastLog = backupLogs[0];
    if (lastLog?.status === 'failure') {
      return {
        icon: 'CloudOff',
        color: 'text-red-500',
        animate: false,
        statusLabel: `同步失败：${lastLog.message || '请查看同步日志'}`,
      };
    }
    return { icon: 'Cloud', color: 'text-green-500', animate: false, statusLabel: '已同步' };
  }, [isAuthenticated, syncStatus, backupLogs, isOnline, pendingSyncCount, lastSyncError]);

  const handleClick = () => {
    if (!isAuthenticated) {
      alert('请先在“设置 > 云同步与备份”登录账号。');
      return;
    }
    setShowLog(true);
  };

  return (
    <>
      <button
        onClick={handleClick}
        className={clsx(
          'relative p-2 rounded-full bg-white/50 dark:bg-zinc-800/50 backdrop-blur-md shadow-sm transition-transform active:scale-95 flex items-center justify-center',
          showLabel && 'gap-2',
          className
        )}
        title={statusLabel}
        aria-label={statusLabel}
      >
        <Icon name={icon} className={clsx('w-5 h-5', color, animate && 'animate-spin')} />
        {showLabel && <span className="min-w-0 truncate text-sm font-medium text-ios-text">{statusLabel}</span>}
        {pendingSyncCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-orange-500 text-white text-[10px] leading-4 text-center font-bold">
            {pendingSyncCount > 9 ? '9+' : pendingSyncCount}
          </span>
        )}
      </button>
      {showLog && <SyncLogModal onClose={() => setShowLog(false)} />}
    </>
  );
};
