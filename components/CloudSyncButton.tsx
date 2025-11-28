
import React, { useState, useMemo } from 'react';
import { useApp } from '../contexts/AppContext';
import { Icon } from './ui/Icon';
import { SyncLogModal } from './SyncLogModal';
import { clsx } from 'clsx';

export const CloudSyncButton: React.FC<{ className?: string }> = ({ className }) => {
  const { state } = useApp();
  const { settings, syncStatus, backupLogs, isOnline } = state;
  const [showLog, setShowLog] = useState(false);

  const { icon, color, animate, status } = useMemo(() => {
    // 1. Not Configured: Gray Cloud
    if (!settings.webdavUrl) {
        return { icon: 'Cloud', color: 'text-gray-300 dark:text-zinc-600', animate: false, status: 'no-config' };
    }
    
    // 2. Configured but Auto-Sync OFF: Warning (Priority)
    if (!settings.enableCloudSync) {
        return { icon: 'AlertTriangle', color: 'text-orange-500', animate: false, status: 'disabled' };
    }
    
    // 3. Offline: WifiOff
    if (!isOnline) {
        return { icon: 'WifiOff', color: 'text-orange-400', animate: false, status: 'offline' };
    }

    // 4. Syncing: RefreshCw (Spin)
    if (syncStatus === 'syncing') {
        return { icon: 'RefreshCw', color: 'text-blue-500', animate: true, status: 'syncing' };
    }

    // 5. No Logs yet: Idle
    if (backupLogs.length === 0) {
        return { icon: 'Cloud', color: 'text-gray-400', animate: false, status: 'idle' };
    }

    const lastLog = backupLogs[0];
    
    // 6. Last Failed: Red CloudOff
    if (lastLog.status === 'failure') {
        return { icon: 'CloudOff', color: 'text-red-500', animate: false, status: 'error' };
    }
    
    // 7. Stale (>24h): Yellow Cloud
    if ((Date.now() - lastLog.timestamp) > 24 * 60 * 60 * 1000) {
        return { icon: 'Cloud', color: 'text-yellow-500', animate: false, status: 'stale' };
    }

    // 8. Success: Green Cloud
    return { icon: 'Cloud', color: 'text-green-500', animate: false, status: 'success' };
  }, [settings, syncStatus, backupLogs, isOnline]);

  const handleClick = () => {
      if (status === 'no-config') {
          alert("未配置云端备份。请前往“设置 -> 同步与备份”进行配置。");
          return;
      }

      // For 'disabled' or any other state, show the log modal.
      // The modal will display a warning banner if sync is disabled.
      setShowLog(true);
  };

  return (
      <>
        <button 
            onClick={handleClick} 
            className={clsx(
                "p-2 rounded-full bg-white/50 dark:bg-zinc-800/50 backdrop-blur-md shadow-sm transition-transform active:scale-95 flex items-center justify-center", 
                className
            )}
            title={status === 'disabled' ? "自动同步未开启" : "云端同步状态"}
        >
            <Icon name={icon} className={clsx("w-5 h-5", color, animate && "animate-spin")} />
        </button>
        {showLog && <SyncLogModal onClose={() => setShowLog(false)} />}
      </>
  );
};
