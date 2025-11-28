import React, { useEffect } from 'react';
import { Icon } from './Icon';

interface ToastProps {
  message: string;
  onUndo?: () => void;
  onClose: () => void;
  duration?: number;
}

export const Toast: React.FC<ToastProps> = ({ message, onUndo, onClose, duration = 4000 }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  return (
    <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+5rem)] left-4 right-4 z-50 animate-fade-in">
      <div className="bg-zinc-800/90 dark:bg-zinc-100/90 backdrop-blur-md text-white dark:text-black px-4 py-3 rounded-2xl shadow-lg flex items-center justify-between">
        <span className="text-sm font-medium">{message}</span>
        {onUndo && (
          <button 
            onClick={onUndo}
            className="text-ios-primary font-bold text-sm px-2 py-1 active:opacity-60"
          >
            撤销
          </button>
        )}
      </div>
    </div>
  );
};
