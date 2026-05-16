import React, { useState, useEffect } from 'react';
import { useApp } from '../contexts/AppContext';
import { Icon } from './ui/Icon';
import { readJsonFile, generateId } from '../utils';
import { db } from '../services/db';
import { AuthPanel } from './AuthPanel';

export const OnboardingView: React.FC = () => {
  const { dispatch, importData, addLedger } = useApp();
  const [mode, setMode] = useState<'intro' | 'create' | 'restore' | 'auth'>('intro');
  const [authDefaultMode, setAuthDefaultMode] = useState<'login' | 'register'>('login');

  const [ledgerName, setLedgerName] = useState('个人生活');
  const [createError, setCreateError] = useState('');

  const [isRestoring, setIsRestoring] = useState(false);

  // Viewport management for iOS keyboard
  const [visualViewport, setVisualViewport] = useState({
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
    offsetTop: 0
  });

  useEffect(() => {
    const handleResize = () => {
      const vv = (window as any).visualViewport;
      if (vv) {
        setVisualViewport({
          height: vv.height,
          offsetTop: vv.offsetTop
        });
      } else {
        setVisualViewport({
          height: window.innerHeight,
          offsetTop: 0
        });
      }
    };

    if ((window as any).visualViewport) {
      (window as any).visualViewport.addEventListener('resize', handleResize);
      (window as any).visualViewport.addEventListener('scroll', handleResize);
      handleResize(); // Init
    } else {
      window.addEventListener('resize', handleResize);
    }

    return () => {
      if ((window as any).visualViewport) {
        (window as any).visualViewport.removeEventListener('resize', handleResize);
        (window as any).visualViewport.removeEventListener('scroll', handleResize);
      } else {
        window.removeEventListener('resize', handleResize);
      }
    };
  }, []);

  const handleCreate = async () => {
    if (!ledgerName.trim()) {
      setCreateError('请输入账本名称');
      return;
    }

    const newLedger = {
      id: generateId(),
      name: ledgerName,
      themeColor: '#007AFF',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isDeleted: false
    };

    await addLedger(newLedger);
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

  const ensureDefaultLedger = async () => {
    const ledgers = (await db.ledgers.toArray()).filter(ledger => !ledger.isDeleted);
    if (ledgers.length > 0) return;
    await addLedger({
      id: generateId(),
      name: ledgerName.trim() || '个人生活',
      themeColor: '#007AFF',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isDeleted: false
    });
  };

  const handleAuthenticated = async () => {
    setIsRestoring(true);
    try {
      await ensureDefaultLedger();
      const finalSettings = await db.settings.get('main');
      await db.settings.put({
        key: 'main',
        value: {
          ...(finalSettings?.value || {}),
          isFirstRun: false
        } as any
      });
      dispatch({ type: 'COMPLETE_ONBOARDING' });
    } finally {
      setIsRestoring(false);
    }
  };

  const renderIntro = () => (
    <div className="flex flex-col items-center justify-start pt-20 min-h-full w-full max-w-sm mx-auto p-6 animate-fade-in">
      <div className="w-24 h-24 bg-ios-primary rounded-[2rem] flex items-center justify-center mb-8 shadow-2xl shadow-blue-500/30">
        <Icon name="Wallet" className="w-12 h-12 text-white" />
      </div>
      <h1 className="text-3xl font-bold mb-2 text-ios-text">个人记账本</h1>
      <p className="text-ios-subtext mb-12 text-center">轻量、安全、可云同步的个人记账。</p>

      <div className="w-full mt-auto mb-8 space-y-4">
        <button
          onClick={() => setMode('create')}
          className="w-full py-4 bg-ios-primary text-white rounded-2xl font-bold text-lg shadow-lg active:scale-95 transition-transform"
        >
          创建新账本
        </button>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => { setAuthDefaultMode('login'); setMode('auth'); }}
            className="w-full py-3 bg-white dark:bg-zinc-800 text-ios-text rounded-2xl font-medium text-base shadow-sm border border-gray-100 dark:border-zinc-700 active:scale-95 transition-transform"
          >
            登录
          </button>
          <button
            onClick={() => { setAuthDefaultMode('register'); setMode('auth'); }}
            className="w-full py-3 bg-white dark:bg-zinc-800 text-ios-text rounded-2xl font-medium text-base shadow-sm border border-gray-100 dark:border-zinc-700 active:scale-95 transition-transform"
          >
            注册
          </button>
        </div>
        <button
          onClick={() => setMode('restore')}
          className="w-full py-4 bg-white dark:bg-zinc-800 text-ios-text rounded-2xl font-medium text-lg shadow-sm border border-gray-100 dark:border-zinc-700 active:scale-95 transition-transform"
        >
          恢复数据
        </button>
        <button
          onClick={() => setMode('create')}
          className="w-full py-3 text-ios-subtext text-sm active:opacity-60 transition-opacity"
        >
          暂不登录，本地使用
        </button>
      </div>
    </div>
  );

  const renderCreate = () => (
    <div className="flex flex-col min-h-full w-full max-w-sm mx-auto p-6 pt-12 animate-fade-in">
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

  const renderAuth = () => (
    <div className="flex flex-col min-h-full w-full max-w-sm mx-auto p-6 pt-12 animate-fade-in">
      <button onClick={() => setMode('intro')} className="self-start mb-6 text-ios-subtext flex items-center gap-1">
        <Icon name="ChevronLeft" className="w-5 h-5" /> 返回
      </button>

      <h2 className="text-2xl font-bold mb-2 text-ios-text">账号同步</h2>
      <p className="text-sm text-ios-subtext mb-6">登录后将账本和图片附件同步到你的私有账号。</p>

      <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-ios-border">
        <AuthPanel defaultMode={authDefaultMode} onAuthenticated={handleAuthenticated} />
        {isRestoring && (
          <div className="mt-4 flex items-center gap-2 text-xs text-ios-subtext">
            <Icon name="Loader2" className="w-4 h-4 animate-spin" />
            正在迁移本地与旧版云端数据...
          </div>
        )}
      </div>
    </div>
  );

  const renderRestore = () => (
    <div className="flex flex-col min-h-full w-full max-w-sm mx-auto p-6 pt-12 animate-fade-in">
      <button onClick={() => setMode('intro')} className="self-start mb-6 text-ios-subtext flex items-center gap-1">
        <Icon name="ChevronLeft" className="w-5 h-5" /> 返回
      </button>

      <h2 className="text-2xl font-bold mb-6 text-ios-text">恢复数据</h2>

      <div className="space-y-6">
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

        <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-ios-border space-y-3">
          <h3 className="font-semibold text-sm text-ios-text flex items-center gap-2"><Icon name="Cloud" className="w-4 h-4" /> 账号云同步</h3>
          <p className="text-xs text-ios-subtext">如需恢复账号云端数据，请先登录或注册账号。</p>
          <button
            onClick={() => { setAuthDefaultMode('login'); setMode('auth'); }}
            className="w-full py-3 bg-gray-100 dark:bg-zinc-800 text-ios-text rounded-xl font-medium active:scale-95 transition-transform"
          >
            登录账号
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="fixed left-0 w-screen bg-ios-bg overflow-y-auto overflow-x-hidden relative"
      style={{
        height: visualViewport.height,
        top: visualViewport.offsetTop
      }}
    >
      {mode === 'intro' && renderIntro()}
      {mode === 'create' && renderCreate()}
      {mode === 'auth' && renderAuth()}
      {mode === 'restore' && renderRestore()}
    </div>
  );
};
