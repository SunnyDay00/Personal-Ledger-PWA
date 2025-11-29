import React, { useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { Icon } from './ui/Icon';
import { readJsonFile } from '../utils';

export const OnboardingView: React.FC = () => {
  const { dispatch, importData, restoreFromD1 } = useApp();
  const [mode, setMode] = useState<'intro' | 'create' | 'restore'>('intro');
  const [restoreTab, setRestoreTab] = useState<'local' | 'cloud'>('cloud');

  const [ledgerName, setLedgerName] = useState('个人生活');
  const [createError, setCreateError] = useState('');

  const [d1Form, setD1Form] = useState({ endpoint: '', token: '', userId: 'default' });
  const [isRestoring, setIsRestoring] = useState(false);

  const handleCreate = () => {
    if (!ledgerName.trim()) {
      setCreateError('请输入账本名称');
      return;
    }
    dispatch({ type: 'UPDATE_LEDGER', payload: { id: 'l1', name: ledgerName, themeColor: '#007AFF', createdAt: Date.now() } });
    dispatch({ type: 'COMPLETE_ONBOARDING' });
  };

  const handleLocalRestore = async (file: File) => {
    try {
      setIsRestoring(true);
      const data = await readJsonFile(file);
      importData(data);
      dispatch({ type: 'COMPLETE_ONBOARDING' });
      alert('本地备份已恢复');
    } catch (e: any) {
      alert('文件解析失败，请确认是正确的备份文件');
    } finally {
      setIsRestoring(false);
    }
  };

  const handleD1Restore = async () => {
    if (!d1Form.endpoint.trim() || !d1Form.token.trim()) {
      alert('请填写同步地址与 AUTH_TOKEN');
      return;
    }
    setIsRestoring(true);
    try {
      dispatch({ type: 'UPDATE_SETTINGS', payload: { syncEndpoint: d1Form.endpoint.trim(), syncToken: d1Form.token.trim(), syncUserId: d1Form.userId.trim() || 'default' } });
      await restoreFromD1();
      dispatch({ type: 'COMPLETE_ONBOARDING' });
      alert('D1+KV 数据已恢复');
    } catch (e: any) {
      alert(e?.message || '恢复失败');
    } finally {
      setIsRestoring(false);
    }
  };

  const renderIntro = () => (
    <div className="flex flex-col items-center justify-center h-full w-full max-w-sm mx-auto p-6 animate-fade-in">
      <div className="w-24 h-24 bg-ios-primary rounded-[2rem] flex items-center justify-center mb-8 shadow-2xl shadow-blue-500/30">
        <Icon name="Wallet" className="w-12 h-12 text-white" />
      </div>
      <h1 className="text-3xl font-bold mb-2 text-ios-text">个人记账本</h1>
      <p className="text-ios-subtext mb-12 text-center">轻量、安全、可云同步的个人记账。</p>

      <button
        onClick={() => setMode('create')}
        className="w-full py-4 bg-ios-primary text-white rounded-2xl font-bold text-lg shadow-lg active:scale-95 transition-transform mb-4"
      >
        创建新账本
      </button>
      <button
        onClick={() => setMode('restore')}
        className="w-full py-4 bg-white dark:bg-zinc-800 text-ios-text rounded-2xl font-medium text-lg shadow-sm border border-gray-100 dark:border-zinc-700 active:scale-95 transition-transform"
      >
        恢复数据
      </button>
    </div>
  );

  const renderCreate = () => (
    <div className="flex flex-col h-full w-full max-w-sm mx-auto p-6 animate-slide-up">
      <button onClick={() => setMode('intro')} className="self-start mb-10 text-ios-subtext flex items-center gap-1">
        <Icon name="ChevronLeft" className="w-5 h-5" /> 返回
      </button>

      <h2 className="text-2xl font-bold mb-6 text-ios-text">创建你的第一个账本</h2>

      <div className="space-y-2 mb-8">
        <label className="text-xs font-semibold text-ios-subtext ml-1 uppercase">账本名称</label>
        <input
          type="text"
          value={ledgerName}
          onChange={(e) => { setLedgerName(e.target.value); setCreateError(''); }}
          className="w-full p-4 rounded-2xl bg-white dark:bg-zinc-800 border-2 border-transparent focus:border-ios-primary outline-none shadow-sm text-lg transition-colors"
          placeholder="如：日常开销"
          autoFocus
        />
        {createError && <p className="text-red-500 text-xs ml-1">{createError}</p>}
      </div>

      <button
        onClick={handleCreate}
        className="w-full py-4 bg-ios-primary text-white rounded-2xl font-bold text-lg shadow-lg active:scale-95 transition-transform"
      >
        开始使用
      </button>
    </div>
  );

  const renderRestore = () => (
    <div className="flex flex-col h-full w-full max-w-sm mx-auto p-6 animate-slide-up">
      <button onClick={() => setMode('intro')} className="self-start mb-6 text-ios-subtext flex items-center gap-1">
        <Icon name="ChevronLeft" className="w-5 h-5" /> 返回
      </button>

      <h2 className="text-2xl font-bold mb-6 text-ios-text">恢复数据</h2>

      <div className="flex p-1 bg-gray-200 dark:bg-zinc-800 rounded-xl mb-6">
        <button
          onClick={() => setRestoreTab('cloud')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${restoreTab === 'cloud' ? 'bg-white dark:bg-zinc-700 shadow-sm text-ios-text' : 'text-ios-subtext'}`}
        >
          云端恢复
        </button>
        <button
          onClick={() => setRestoreTab('local')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${restoreTab === 'local' ? 'bg-white dark:bg-zinc-700 shadow-sm text-ios-text' : 'text-ios-subtext'}`}
        >
          本地导入
        </button>
      </div>

      {restoreTab === 'cloud' ? (
        <div className="space-y-6">
          <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-ios-border space-y-3">
            <h3 className="font-semibold text-sm text-ios-text flex items-center gap-2"><Icon name="Cloud" className="w-4 h-4" /> D1 + KV 恢复</h3>
            <input
              className="w-full bg-gray-100 dark:bg-zinc-800 p-3 rounded-xl text-sm outline-none border border-transparent focus:border-ios-primary"
              placeholder="同步地址，如 https://sync.xxx.workers.dev"
              value={d1Form.endpoint} onChange={e => setD1Form({ ...d1Form, endpoint: e.target.value })}
            />
            <input
              className="w-full bg-gray-100 dark:bg-zinc-800 p-3 rounded-xl text-sm outline-none border border-transparent focus:border-ios-primary"
              placeholder="AUTH_TOKEN"
              type="password"
              value={d1Form.token} onChange={e => setD1Form({ ...d1Form, token: e.target.value })}
            />
            <input
              className="w-full bg-gray-100 dark:bg-zinc-800 p-3 rounded-xl text-sm outline-none border border-transparent focus:border-ios-primary"
              placeholder="用户标识（多设备一致）"
              value={d1Form.userId} onChange={e => setD1Form({ ...d1Form, userId: e.target.value })}
            />
            <button
              onClick={handleD1Restore}
              disabled={isRestoring}
              className="w-full py-3 bg-emerald-500 text-white rounded-xl font-semibold shadow active:scale-95 transition-transform disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {isRestoring ? <Icon name="Loader2" className="w-4 h-4 animate-spin" /> : <Icon name="Download" className="w-4 h-4" />}
              {isRestoring ? '正在恢复...' : '从 D1+KV 恢复'}
            </button>
            <p className="text-xs text-ios-subtext">只拉取云端数据，不会覆盖云端，适合首次恢复。</p>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-ios-border space-y-2">
            <h3 className="font-semibold text-sm text-ios-text flex items-center gap-2"><Icon name="CloudCog" className="w-4 h-4" /> WebDAV 恢复</h3>
            <p className="text-xs text-ios-subtext">如需 WebDAV 恢复，可在完成引导后到“设置-同步与备份”中手动恢复。</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed border-gray-300 dark:border-zinc-700 rounded-2xl bg-white/50 dark:bg-zinc-900/50">
          <Icon name="FileJson" className="w-12 h-12 text-ios-subtext mb-4" />
          <p className="text-ios-text font-medium mb-6">选择 .json 备份文件</p>
          <label
            className="px-8 py-3 bg-ios-primary text-white rounded-xl font-medium shadow-lg active:scale-95 transition-transform cursor-pointer"
          >
            选择文件
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={async (e) => {
                if (e.target.files?.[0]) handleLocalRestore(e.target.files[0]);
              }}
            />
          </label>
        </div>
      )}
    </div>
  );

  return (
    <div className="h-screen w-screen bg-ios-bg overflow-hidden relative">
      {mode === 'intro' && renderIntro()}
      {mode === 'create' && renderCreate()}
      {mode === 'restore' && renderRestore()}
    </div>
  );
};
