

import React, { useState, useRef } from 'react';
import { useApp } from '../contexts/AppContext';
import { Icon } from './ui/Icon';
import { readJsonFile, parseCsvToTransactions, extractCategoriesFromCsv } from '../utils';
import { WebDAVService } from '../services/webdav';
import { AppSettings, Ledger, Transaction } from '../types';
import { DEFAULT_SETTINGS } from '../constants';

export const OnboardingView: React.FC = () => {
  const { dispatch, importData } = useApp();
  const [mode, setMode] = useState<'intro' | 'create' | 'restore'>('intro');
  const [restoreTab, setRestoreTab] = useState<'local' | 'cloud'>('cloud');
  
  // Create State
  const [ledgerName, setLedgerName] = useState('个人生活');
  const [createError, setCreateError] = useState('');

  // Restore State
  const [webdavForm, setWebdavForm] = useState({ url: '', user: '', pass: '' });
  const [isRestoring, setIsRestoring] = useState(false);

  // Handlers
  const handleCreate = () => {
    if (!ledgerName.trim()) {
        setCreateError('请为您的第一个账本起个名字');
        return;
    }
    dispatch({ 
        type: 'UPDATE_LEDGER', 
        payload: { id: 'l1', name: ledgerName, themeColor: '#007AFF', createdAt: Date.now() } 
    });
    dispatch({ type: 'COMPLETE_ONBOARDING' });
  };

  const handleLocalRestore = async (file: File) => {
      try {
          setIsRestoring(true);
          const data = await readJsonFile(file);
          importData(data);
          // Ensure first run is false even if backup says otherwise
          dispatch({ type: 'COMPLETE_ONBOARDING' });
      } catch (e) {
          alert('文件解析失败，请确保是正确的备份文件');
          setIsRestoring(false);
      }
  };

  const handleCloudRestore = async () => {
      const rawUrl = webdavForm.url.trim();
      const user = webdavForm.user.trim();
      const pass = webdavForm.pass.trim();

      if (!rawUrl || !user || !pass) {
          alert('请填写完整的 WebDAV 配置');
          return;
      }
      setIsRestoring(true);
      
      try {
          // Construct temp settings to use service
          const service = new WebDAVService({ 
              webdavUrl: rawUrl, 
              webdavUser: user, 
              webdavPass: pass 
          } as AppSettings);

          // 0. Pre-flight Connection Check
          try {
              await service.checkConnection();
          } catch (connErr: any) {
              throw new Error(`连接失败：${connErr.message}`);
          }

          // 1. Get Settings & Categories
          let settingsData: any = {};
          try {
            const { text: settingsStr } = await service.getFile('settings.json');
            settingsData = JSON.parse(settingsStr);
          } catch (e: any) {
            if (e.message.includes('404') || e.message.includes('不存在')) {
                throw new Error("连接成功，但在云端未找到备份数据 (settings.json)。\n如果是首次使用，请返回选择“新建账本”。");
            }
            throw new Error(`读取配置文件失败: ${e.message}`);
          }

          // 2. Get Ledgers
          let ledgersData: Ledger[] = [];
          try {
            const { text: ledgersStr } = await service.getFile('ledgers.json');
            ledgersData = JSON.parse(ledgersStr);
          } catch (e) {
             console.error("Failed to load ledgers.json", e);
             ledgersData = [{ id: 'l1', name: '恢复的账本', themeColor: '#007AFF', createdAt: Date.now() }];
          }

          // 3. Get Transactions per ledger (CSV) & Handle Smart Categories
          let allTxs: Transaction[] = [];
          let importedCategories = [...(settingsData.categories || [])];
          
          for (const l of ledgersData) {
              try {
                  const { text: csv } = await service.getFile(`ledger_${l.id}.csv`);
                  
                  // Extract Potential Categories from CSV
                  const csvCats = extractCategoriesFromCsv(csv);
                  csvCats.forEach(csvCat => {
                       const exists = importedCategories.find((c: any) => c.id === csvCat.id || c.name === csvCat.name);
                       if (!exists) {
                           importedCategories.push({
                               id: csvCat.id.startsWith('auto_') ? csvCat.id : csvCat.id,
                               name: csvCat.name,
                               type: csvCat.type,
                               icon: 'HelpCircle',
                               order: 999
                           });
                       }
                  });

                  // Parse Txs
                  const txs = parseCsvToTransactions(csv);
                  allTxs = [...allTxs, ...txs];
              } catch (e) {
                  console.warn(`Could not load transactions for ledger ${l.name}`, e);
              }
          }

          // 4. Merge Data Logic (Robust)
          
          // Normalize URL logic here same as WebDAVService to ensure clean state
          let finalUrl = rawUrl;
          if (finalUrl && !/^https?:\/\//i.test(finalUrl)) {
              finalUrl = 'https://' + finalUrl;
          }

          // Extract settings from cloud data, carefully removing webdav fields to prevent overwrite
          const { settings: cloudSettingsRaw, ...otherCloudData } = settingsData || {};
          // Remove potentially empty or old WebDAV config from cloud settings
          const { 
              webdavUrl: _u, 
              webdavUser: _user, 
              webdavPass: _p, 
              enableCloudSync: _ecs,
              ...safeCloudSettings 
          } = cloudSettingsRaw || {};

          // Construct final settings explicitly
          const finalSettings: AppSettings = {
              ...DEFAULT_SETTINGS, // 1. Start with defaults
              ...safeCloudSettings, // 2. Apply cloud preferences (theme, budget, etc.)
              // 3. FORCE override critical auth fields with user input
              webdavUrl: finalUrl,
              webdavUser: user,
              webdavPass: pass,
              isFirstRun: false,
              enableCloudSync: false // Force off for safety after restore
          };

          const restoredState: Partial<any> = {
              ...otherCloudData, // Spread non-settings data (logs, etc)
              categories: importedCategories,
              ledgers: ledgersData,
              transactions: allTxs,
              settings: finalSettings // Explicitly set the robustly constructed settings
          };

          importData(restoredState);
          
          setTimeout(() => {
             dispatch({ type: 'COMPLETE_ONBOARDING' });
             alert('✅ 云端数据恢复成功！\n\n请注意：为了数据安全，自动同步已默认关闭。\n请进入设置页检查配置并手动开启。');
          }, 100);
          
      } catch (e: any) {
          console.error(e);
          alert(`❌ ${e.message}`);
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
        <p className="text-ios-subtext mb-12 text-center">
            极简、安全、本地优先。<br/>您的财务数据完全由您掌控。
        </p>
        
        <button 
            onClick={() => setMode('create')}
            className="w-full py-4 bg-ios-primary text-white rounded-2xl font-bold text-lg shadow-lg active:scale-95 transition-transform mb-4"
        >
            新建账本
        </button>
        <button 
            onClick={() => setMode('restore')}
            className="w-full py-4 bg-white dark:bg-zinc-800 text-ios-text rounded-2xl font-medium text-lg shadow-sm border border-gray-100 dark:border-zinc-700 active:scale-95 transition-transform"
        >
            恢复备份
        </button>
      </div>
  );

  const renderCreate = () => (
      <div className="flex flex-col h-full w-full max-w-sm mx-auto p-6 animate-slide-up">
         <button onClick={() => setMode('intro')} className="self-start mb-10 text-ios-subtext flex items-center gap-1">
             <Icon name="ChevronLeft" className="w-5 h-5" /> 返回
         </button>
         
         <h2 className="text-2xl font-bold mb-6 text-ios-text">创建您的第一个账本</h2>
         
         <div className="space-y-2 mb-8">
            <label className="text-xs font-semibold text-ios-subtext ml-1 uppercase">账本名称</label>
            <input 
                type="text" 
                value={ledgerName}
                onChange={(e) => { setLedgerName(e.target.value); setCreateError(''); }}
                className="w-full p-4 rounded-2xl bg-white dark:bg-zinc-800 border-2 border-transparent focus:border-ios-primary outline-none shadow-sm text-lg transition-colors"
                placeholder="例如：日常开销"
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
             <div className="space-y-4">
                 <div className="space-y-3">
                    <input 
                        className="w-full bg-white dark:bg-zinc-800 p-4 rounded-xl text-sm outline-none border border-transparent focus:border-ios-primary" 
                        placeholder="WebDAV 服务器地址" 
                        value={webdavForm.url} onChange={e => setWebdavForm({...webdavForm, url: e.target.value})}
                    />
                    <input 
                        className="w-full bg-white dark:bg-zinc-800 p-4 rounded-xl text-sm outline-none border border-transparent focus:border-ios-primary" 
                        placeholder="账号" 
                        value={webdavForm.user} onChange={e => setWebdavForm({...webdavForm, user: e.target.value})}
                    />
                    <input 
                        className="w-full bg-white dark:bg-zinc-800 p-4 rounded-xl text-sm outline-none border border-transparent focus:border-ios-primary" 
                        type="password" 
                        placeholder="应用密码" 
                        value={webdavForm.pass} onChange={e => setWebdavForm({...webdavForm, pass: e.target.value})}
                    />
                 </div>
                 <button 
                    onClick={handleCloudRestore}
                    disabled={isRestoring}
                    className="w-full py-4 bg-ios-primary text-white rounded-2xl font-bold text-lg shadow-lg active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
                 >
                    {isRestoring ? <Icon name="Loader2" className="w-5 h-5 animate-spin" /> : <Icon name="CloudDownload" className="w-5 h-5" />}
                    {isRestoring ? '正在恢复...' : '开始恢复'}
                 </button>
                 <p className="text-xs text-ios-subtext text-center mt-2">
                     支持坚果云等标准 WebDAV 服务。<br/>
                     恢复将下载：配置、账本列表及所有 CSV 账单。
                 </p>
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
