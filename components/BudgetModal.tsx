
import React, { useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { Icon } from './ui/Icon';
import { BudgetType, AppSettings } from '../types';

interface BudgetModalProps {
  onClose: () => void;
}

export const BudgetModal: React.FC<BudgetModalProps> = ({ onClose }) => {
  const { state, dispatch } = useApp();
  const { budget } = state.settings;
  const [activeType, setActiveType] = useState<BudgetType>('month');

  const updateBudget = (updates: Partial<AppSettings['budget']>) => {
    dispatch({
      type: 'UPDATE_SETTINGS',
      payload: { budget: { ...budget, ...updates } }
    });
  };

  const updateTarget = (type: BudgetType, field: 'expense' | 'income', value: string) => {
    const numVal = parseFloat(value) || 0;
    dispatch({
      type: 'UPDATE_SETTINGS',
      payload: { 
        budget: { 
          ...budget, 
          targets: {
            ...budget.targets,
            [type]: {
              ...budget.targets[type],
              [field]: numVal
            }
          }
        } 
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-ios-bg animate-slide-up flex flex-col">
      {/* Header */}
      <div className="pt-[env(safe-area-inset-top)] px-4 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-b border-ios-border z-10">
        <div className="flex items-center justify-between h-14">
            <button onClick={onClose} className="p-2 -ml-2 text-ios-subtext">取消</button>
            <h1 className="font-semibold text-lg">预算设置</h1>
            <button onClick={onClose} className="p-2 -mr-2 text-ios-primary font-bold">完成</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 no-scrollbar space-y-6">
        
        {/* Master Switch */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 flex items-center justify-between shadow-sm">
            <div className="flex flex-col">
                <span className="font-medium text-ios-text">开启预算功能</span>
                <span className="text-xs text-ios-subtext">在首页显示预算进度</span>
            </div>
            <button 
                onClick={() => updateBudget({ enabled: !budget.enabled })}
                className={`w-12 h-7 rounded-full transition-colors relative ${budget.enabled ? 'bg-ios-primary' : 'bg-gray-300 dark:bg-zinc-600'}`}
            >
                <div className={`absolute top-1 left-1 bg-white w-5 h-5 rounded-full shadow-sm transition-transform ${budget.enabled ? 'translate-x-5' : ''}`}></div>
            </button>
        </div>

        {budget.enabled && (
            <>
                {/* Home Display Setting */}
                <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 shadow-sm space-y-3">
                    <h3 className="text-xs font-semibold text-ios-subtext uppercase">首页显示</h3>
                    <div className="flex bg-gray-100 dark:bg-zinc-800 p-1 rounded-xl">
                        {(['week', 'month', 'year'] as const).map(t => (
                            <button
                                key={t}
                                onClick={() => updateBudget({ displayType: t })}
                                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${budget.displayType === t ? 'bg-white dark:bg-zinc-700 shadow-sm text-ios-text' : 'text-ios-subtext'}`}
                            >
                                {t === 'week' ? '周预算' : t === 'month' ? '月预算' : '年预算'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Targets Configuration */}
                <div className="bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden shadow-sm">
                    <div className="flex border-b border-gray-100 dark:border-zinc-800">
                        {(['week', 'month', 'year'] as const).map(t => (
                            <button
                                key={t}
                                onClick={() => setActiveType(t)}
                                className={`flex-1 py-3 text-sm font-medium ${activeType === t ? 'text-ios-primary bg-gray-50 dark:bg-zinc-800/50' : 'text-ios-subtext'}`}
                            >
                                {t === 'week' ? '周' : t === 'month' ? '月' : '年'}
                            </button>
                        ))}
                    </div>
                    
                    <div className="p-4 space-y-4">
                        <div>
                            <label className="text-xs text-ios-subtext uppercase ml-1">支出预算 ({activeType === 'week' ? '每周' : activeType === 'month' ? '每月' : '每年'})</label>
                            <div className="flex items-center gap-2 mt-1 bg-gray-100 dark:bg-zinc-800 px-3 py-2 rounded-xl">
                                <span className="text-ios-subtext tabular-nums">¥</span>
                                <input 
                                    type="number" 
                                    className="flex-1 bg-transparent outline-none tabular-nums text-lg"
                                    value={budget.targets[activeType].expense}
                                    onChange={(e) => updateTarget(activeType, 'expense', e.target.value)}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs text-ios-subtext uppercase ml-1">收入目标 ({activeType === 'week' ? '每周' : activeType === 'month' ? '每月' : '每年'})</label>
                            <div className="flex items-center gap-2 mt-1 bg-gray-100 dark:bg-zinc-800 px-3 py-2 rounded-xl">
                                <span className="text-ios-subtext tabular-nums">¥</span>
                                <input 
                                    type="number" 
                                    className="flex-1 bg-transparent outline-none tabular-nums text-lg"
                                    value={budget.targets[activeType].income}
                                    onChange={(e) => updateTarget(activeType, 'income', e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Notifications */}
                <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 shadow-sm">
                    <div className="flex justify-between items-center mb-2">
                        <span className="font-medium text-sm">预算剩余提醒</span>
                        <span className="text-ios-primary font-bold text-sm">{budget.notifyThreshold}%</span>
                    </div>
                    <input 
                        type="range" 
                        min="50" 
                        max="100" 
                        step="5" 
                        value={budget.notifyThreshold} 
                        onChange={(e) => updateBudget({ notifyThreshold: parseInt(e.target.value) })}
                        className="w-full accent-ios-primary" 
                    />
                    <p className="text-xs text-ios-subtext mt-2">当支出达到预算的 {budget.notifyThreshold}% 时，进度条将变为红色示警。</p>
                </div>
            </>
        )}
      </div>
    </div>
  );
};
