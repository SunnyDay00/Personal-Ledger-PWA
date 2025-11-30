import React, { useMemo, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { Icon } from './ui/Icon';
import { SyncLogModal } from './SyncLogModal';
import { clsx } from 'clsx';

export const CloudSyncButton: React.FC<{ className?: string }> = ({ className }) => {
  const { state } = useApp();
  const { settings, syncStatus, backupLogs, isOnline } = state;
  const [showLog, setShowLog] = useState(false);

  const { icon, color, animate, status } = useMemo(() => {
    const configured = settings.syncEndpoint && settings.syncToken;
    if (!configured) {
      return { icon: 'Cloud', color: 'text-gray-300 dark:text-zinc-600', animate: false, status: 'no-config' };
    }
    if (!isOnline) {
      return { icon: 'WifiOff', color: 'text-orange-400', animate: false, status: 'offline' };
    }
    if (syncStatus === 'syncing') {
      return { icon: 'RefreshCw', color: 'text-blue-500', animate: true, status: 'syncing' };
    }
    if (backupLogs.length === 0) {
      return { icon: 'Cloud', color: 'text-gray-400', animate: false, status: 'idle' };
    }
    const lastLog = backupLogs[0];
    if (lastLog.status === 'failure') {
      return { icon: 'CloudOff', color: 'text-red-500', animate: false, status: 'error' };
    }
    if (Date.now() - lastLog.timestamp > 24 * 60 * 60 * 1000) {
      return { icon: 'Cloud', color: 'text-yellow-500', animate: false, status: 'stale' };
    }
    return { icon: 'Cloud', color: 'text-green-500', animate: false, status: 'success' };
  }, [settings.syncEndpoint, settings.syncToken, syncStatus, backupLogs, isOnline]);

  const handleClick = () => {
    if (!settings.syncEndpoint || !settings.syncToken) {
      alert('未配置云同步，请前往“设置 > 同步与备份”填写地址和 AUTH_TOKEN。');
      return;
    }
    setShowLog(true);
  };

  return (
    <>
      <button
        onClick={handleClick}
        className={clsx(
          'p-2 rounded-full bg-white/50 dark:bg-zinc-800/50 backdrop-blur-md shadow-sm transition-transform active:scale-95 flex items-center justify-center',
          className
        )}
        title="云端同步状态"
      >
        <Icon name={icon} className={clsx('w-5 h-5', color, animate && 'animate-spin')} />
      </button>
      {showLog && <SyncLogModal onClose={() => setShowLog(false)} />}
    </>
  );
};
