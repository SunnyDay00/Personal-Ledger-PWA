import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useApp } from '../contexts/AppContext';
import { Icon } from './ui/Icon';
import { CloudSyncButton } from './CloudSyncButton'; 
import { THEME_PRESETS, AVAILABLE_ICONS } from '../constants';
import { UPDATE_LOGS } from '../changelog';
import { generateId, exportToJson, exportToCsv, formatCurrency, cn } from '../utils';
import { WebDAVService } from '../services/webdav';
import { format } from 'date-fns';
import { SyncLogModal } from './SyncLogModal';
import { Ledger } from '../types';

type SettingsPage = 'main' | 'security' | 'ledgers' | 'theme' | 'history' | 'about' | 'categories' | 'layout';

const SettingsGroup: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="flex flex-col mb-6">
        <h3 className="px-4 mb-2 text-xs font-semibold text-ios-subtext uppercase tracking-wider">{title}</h3>
        <div className="bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden mx-4 shadow-sm border border-ios-border">
            {children}
        </div>
    </div>
);

const SettingsItem: React.FC<{ icon: string; label: string; value?: string; onClick: () => void; isLast?: boolean }> = ({ icon, label, value, onClick, isLast }) => (
    <button type="button" onClick={onClick} className={cn("w-full flex items-center justify-between p-4 active:bg-gray-50 dark:active:bg-zinc-800 transition-colors", !isLast && "border-b border-gray-100 dark:border-zinc-800/50")}>
        <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-ios-primary/10 flex items-center justify-center text-ios-primary">
                <Icon name={icon} className="w-4 h-4" />
            </div>
            <span className="font-medium text-sm text-ios-text">{label}</span>
        </div>
        <div className="flex items-center gap-2">
            {value && <span className="text-xs text-ios-subtext">{value}</span>}
            <Icon name="ChevronRight" className="w-4 h-4 text-ios-subtext/50" />
        </div>
    </button>
);

export const SettingsView: React.FC = () => {
  const { state, dispatch, manualBackup, restoreFromCloud, smartImportCsv } = useApp();
  const [page, setPage] = useState<SettingsPage>('main');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [page]);

  const [webdavForm, setWebdavForm] = useState({
      url: state.settings.webdavUrl || '',
      user: state.settings.webdavUser || '',
      pass: state.settings.webdavPass || ''
  });
  
  const [isWebDavEditing, setIsWebDavEditing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [showSyncLog, setShowSyncLog] = useState(false);

  // Sync local form state with global state when not editing
  useEffect(() => {
    if (!isWebDavEditing) {
        setWebdavForm({
            url: state.settings.webdavUrl || '',
            user: state.settings.webdavUser || '',
            pass: state.settings.webdavPass || ''
        });
    }
  }, [state.settings, isWebDavEditing]);

  const [ledgerModal, setLedgerModal] = useState<{isOpen: boolean; mode: 'create' | 'edit'; id?: string; name: string; color: string;}>({ isOpen: false, mode: 'create', name: '', color: '#007AFF' });
  const [catType, setCatType] = useState<'expense' | 'income'>('expense');
  const [isAddingCat, setIsAddingCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('Circle');
  const [isReordering, setIsReordering] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => {
      if (!isReordering) setDragIndex(null);
  }, [isReordering]);

  // Export Modal State
  const [exportModal, setExportModal] = useState<{
      isOpen: boolean;
      selectedLedgerIds: Set<string>;
      rangeMode: 'all' | 'month' | 'year' | 'custom';
      customStart: string;
      customEnd: string;
  }>({
      isOpen: false,
      selectedLedgerIds: new Set(),
      rangeMode: 'all',
      customStart: format(new Date(), 'yyyy-MM-01'),
      customEnd: format(new Date(), 'yyyy-MM-dd')
  });

  // Sorting Categories for Display
  const sortedCategories = useMemo(() => {
      return state.categories
          .filter(c => c.type === catType)
          .sort((a, b) => a.order - b.order);
  }, [state.categories, catType]);

  const openCreateLedger = () => setLedgerModal({ isOpen: true, mode: 'create', name: '', color: '#007AFF' });
  const openEditLedger = (l: Ledger) => setLedgerModal({ isOpen: true, mode: 'edit', id: l.id, name: l.name, color: l.themeColor });

  const saveLedger = () => {
      if (!ledgerModal.name.trim()) return window.alert("请输入账本名称");
      if (ledgerModal.mode === 'create') {
          dispatch({ type: 'ADD_LEDGER', payload: { id: generateId(), name: ledgerModal.name, themeColor: ledgerModal.color, createdAt: Date.now() } });
      } else if (ledgerModal.mode === 'edit' && ledgerModal.id) {
          const original = state.ledgers.find(l => l.id === ledgerModal.id);
          if (original) dispatch({ type: 'UPDATE_LEDGER', payload: { ...original, name: ledgerModal.name, themeColor: ledgerModal.color } });
      }
      setLedgerModal({ ...ledgerModal, isOpen: false });
  };

  const openExportDialog = (l?: Ledger) => {
      setExportModal({
          isOpen: true,
          selectedLedgerIds: l ? new Set([l.id]) : new Set(state.ledgers.map(x => x.id)),
          rangeMode: 'all',
          customStart: format(new Date(), 'yyyy-MM-01'),
          customEnd: format(new Date(), 'yyyy-MM-dd')
      });
  };

  const runExport = () => {
      const { selectedLedgerIds, rangeMode, customStart, customEnd } = exportModal;
      
      if (selectedLedgerIds.size === 0) {
          window.alert("请至少选择一个账本");
          return;
      }

      let startTs = 0;
      let endTs = Infinity;
      const now = new Date();

      if (rangeMode === 'month') {
          startTs = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
          endTs = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
      } else if (rangeMode === 'year') {
          startTs = new Date(now.getFullYear(), 0, 1).getTime();
          endTs = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999).getTime();
      } else if (rangeMode === 'custom') {
          if (!customStart || !customEnd) {
              window.alert("请选择完整的日期范围");
              return;
          }
          // Parse as local time 00:00
          const [sY, sM, sD] = customStart.split('-').map(Number);
          startTs = new Date(sY, sM - 1, sD).getTime();
          
          const [eY, eM, eD] = customEnd.split('-').map(Number);
          endTs = new Date(eY, eM - 1, eD, 23, 59, 59, 999).getTime();
      }

      const targetTxs = state.transactions.filter(t => 
          selectedLedgerIds.has(t.ledgerId) &&
          t.date >= startTs &&
          t.date <= endTs
      );

      if (targetTxs.length === 0) {
          window.alert("所选范围内暂无数据");
          return;
      }

      let filename = 'Export';
      if (selectedLedgerIds.size === 1) {
          const ledgerName = state.ledgers.find(l => l.id === Array.from(selectedLedgerIds)[0])?.name || 'Ledger';
          filename = `${ledgerName}`;
      } else {
          filename = `Multi_Ledger`;
      }
      
      const dateSuffix = rangeMode === 'all' ? 'All_Time' : 
                        rangeMode === 'custom' ? `${customStart}_to_${customEnd}` :
                        format(now, 'yyyyMMdd');
                        
      filename = `${filename}_${dateSuffix}.csv`;

      exportToCsv(targetTxs, state.categories, state.ledgers, filename);
      setExportModal({ ...exportModal, isOpen: false });
  };

  const handleDeleteLedger = (e: React.MouseEvent, l: Ledger) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (state.ledgers.length <= 1) {
          window.alert("至少保留一个账本");
          return;
      }
      
      const confirmMsg = `⚠️ 删除确认\n\n您确定要删除账本“${l.name}”吗？\n\n此操作将执行以下清理：\n1. 永久清除该账本在本地的所有账目数据。\n2. 同步删除云端的备份文件（如果已配置同步）。\n\n警告：数据删除后无法恢复！\n\n是否确认继续删除？`;

      if (window.confirm(confirmMsg)) {
          // 1. Delete Local First (Optimistic Update)
          dispatch({type: 'DELETE_LEDGER', payload: l.id});

          // 2. Try Cloud Delete in Background
          if (state.settings.webdavUrl && state.settings.webdavUser && state.settings.webdavPass) {
              const service = new WebDAVService(state.settings);
              service.deleteFile(`ledger_${l.id}.csv`)
                  .then(() => console.log(`Cloud file ledger_${l.id}.csv deleted.`))
                  .catch(err => console.error("Cloud delete failed (non-blocking)", err));
          }
      }
  };

  const handleAddCategory = () => {
      if (!newCatName.trim()) return window.alert("请输入分类名称");
      dispatch({ type: 'ADD_CATEGORY', payload: { id: `${catType}_${Date.now()}`, name: newCatName.trim(), icon: newCatIcon, type: catType, order: sortedCategories.length } });
      setIsAddingCat(false);
      setNewCatName('');
      setNewCatIcon('Circle');
  };

  const handleDeleteCategory = (e: React.MouseEvent, id: string) => {
      e.preventDefault();
      e.stopPropagation();
      if (window.confirm("删除分类后，该分类下的历史账目图标将无法显示。确定删除吗？")) {
          dispatch({ type: 'DELETE_CATEGORY', payload: id });
      }
  };

  const moveCategory = (index: number, direction: 'left' | 'right') => {
      if (direction === 'left' && index === 0) return;
      if (direction === 'right' && index === sortedCategories.length - 1) return;

      const newSorted = [...sortedCategories];
      const targetIndex = direction === 'left' ? index - 1 : index + 1;
      
      // Swap
      [newSorted[index], newSorted[targetIndex]] = [newSorted[targetIndex], newSorted[index]];

      // Update Order ID
      const reorderedPayload = newSorted.map((c, i) => ({ ...c, order: i }));
      
      dispatch({ type: 'REORDER_CATEGORIES', payload: reorderedPayload });
  };

  const handleDragStart = (index: number) => {
      if (!isReordering) return;
      setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent) => {
      if (!isReordering) return;
      e.preventDefault();
  };

  const handleDrop = (index: number) => {
      if (!isReordering || dragIndex === null || dragIndex === index) {
          setDragIndex(null);
          return;
      }
      const newSorted = [...sortedCategories];
      const [moved] = newSorted.splice(dragIndex, 1);
      newSorted.splice(index, 0, moved);
      const reorderedPayload = newSorted.map((c, i) => ({ ...c, order: i }));
      dispatch({ type: 'REORDER_CATEGORIES', payload: reorderedPayload });
      setDragIndex(null);
  };

  const handleDragEnd = () => setDragIndex(null);

  const testConnection = async () => {
      const url = (webdavForm.url || '').trim();
      const user = (webdavForm.user || '').trim();
      const pass = (webdavForm.pass || '').trim();
      
      if (!url) {
          window.alert("请输入服务器地址");
          return false;
      }
      if (!user || !pass) {
          window.alert("请输入账号和密码");
          return false;
      }

      setIsTestingConnection(true);
      try {
          const service = new WebDAVService({ ...state.settings, webdavUrl: url, webdavUser: user, webdavPass: pass });
          await service.checkConnection();
          window.alert("✅ 连接成功");
          setIsTestingConnection(false);
          return true;
      } catch (e: any) {
          window.alert(`❌ 连接失败: ${e.message}`);
          setIsTestingConnection(false);
          return false;
      }
  };

  const handleSaveWebDav = async () => {
      const url = webdavForm.url.trim();
      const user = webdavForm.user.trim();
      const pass = webdavForm.pass.trim();

      if (!url || !user || !pass) {
          if(!window.confirm("WebDAV 配置不完整，确定要保存吗？(将无法使用同步功能)")) return;
      }

      dispatch({
          type: 'UPDATE_SETTINGS',
          payload: {
              webdavUrl: url,
              webdavUser: user,
              webdavPass: pass,
              // If clearing config, force sync off
              enableCloudSync: (!url || !user || !pass) ? false : state.settings.enableCloudSync
          }
      });
      setIsWebDavEditing(false);
      window.alert("设置已保存");
  };

  const toggleCloudSync = () => {
      const { enableCloudSync, webdavUrl, webdavUser, webdavPass } = state.settings;
      
      if (!enableCloudSync) {
          const missing = [];
          if (!webdavUrl?.trim()) missing.push("服务器地址");
          if (!webdavUser?.trim()) missing.push("账号");
          if (!webdavPass?.trim()) missing.push("密码");

          if (missing.length > 0) {
              if (window.confirm(`无法开启同步：WebDAV 配置不完整 (${missing.join('、')})。\n是否现在前往配置？`)) {
                  setPage('security');
              }
              return;
          }
          dispatch({ type: 'UPDATE_SETTINGS', payload: { enableCloudSync: true } });
      } else {
          dispatch({ type: 'UPDATE_SETTINGS', payload: { enableCloudSync: false } });
      }
  };

  const renderMainContent = () => (
      <>
        <div className="h-4"></div>
        <SettingsGroup title="同步与备份">
            <div className="p-4 flex items-center justify-between border-b border-gray-100 dark:border-zinc-800/50">
                <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-green-500 flex items-center justify-center text-white">
                        <Icon name="RefreshCw" className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col">
                        <span className="font-medium text-sm text-ios-text">自动云端同步</span>
                        <span className="text-[10px] text-ios-subtext">数据变动时自动上传</span>
                    </div>
                </div>
                <button 
                    onClick={toggleCloudSync}
                    className={cn("w-12 h-7 rounded-full transition-colors relative", state.settings.enableCloudSync ? 'bg-ios-primary' : 'bg-gray-300 dark:bg-zinc-600')}
                >
                    <div className={cn("absolute top-1 left-1 bg-white w-5 h-5 rounded-full shadow-sm transition-transform", state.settings.enableCloudSync ? 'translate-x-5' : '')}></div>
                </button>
            </div>
            <SettingsItem icon="Cloud" label="云端备份配置" value={state.settings.webdavUrl ? '已配置' : '未配置'} onClick={() => setPage('security')} />
            <SettingsItem icon="FileText" label="同步日志" onClick={() => setShowSyncLog(true)} isLast />
        </SettingsGroup>

        <SettingsGroup title="管理">
            <SettingsItem icon="Book" label="多账本管理" value={`${state.ledgers.length}个`} onClick={() => setPage('ledgers')} />
            <SettingsItem icon="Grid" label="分类管理" onClick={() => setPage('categories')} />
            <SettingsItem icon="ClipboardList" label="操作历史" onClick={() => setPage('history')} />
        </SettingsGroup>

        <SettingsGroup title="个性化">
            <SettingsItem icon="Palette" label="主题设置" value={state.settings.themeMode === 'auto' ? '跟随系统' : state.settings.themeMode === 'dark' ? '深色' : '浅色'} onClick={() => setPage('theme')} />
            <SettingsItem icon="Layout" label="界面布局" value="键盘/网格" onClick={() => setPage('layout')} />
        </SettingsGroup>

        <SettingsGroup title="其他">
            <SettingsItem icon="Download" label="导出数据 (JSON)" onClick={() => {
                 exportToJson(state, `ledger_backup_${format(new Date(), 'yyyyMMdd_HHmm')}.json`);
            }} />
            <SettingsItem icon="Info" label="关于" value={`v${state.settings.version}`} onClick={() => setPage('about')} isLast />
        </SettingsGroup>
      </>
  );

  const renderSecurity = () => (
      <>
        <div className="h-4"></div>
        <div className="bg-white dark:bg-zinc-900 rounded-2xl mx-4 shadow-sm border border-ios-border p-4 space-y-4">
            <div>
                <label className="text-xs font-medium text-ios-subtext ml-1 mb-1 block">服务器地址 (URL)</label>
                <input 
                    type="text" 
                    placeholder="https://dav.jianguoyun.com/dav/" 
                    className="w-full bg-gray-100 dark:bg-zinc-800 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-ios-primary/20"
                    value={webdavForm.url}
                    onChange={(e) => { setWebdavForm({...webdavForm, url: e.target.value}); setIsWebDavEditing(true); }}
                />
            </div>
            <div>
                <label className="text-xs font-medium text-ios-subtext ml-1 mb-1 block">账号 (User)</label>
                <input 
                    type="text" 
                    placeholder="WebDAV 账号" 
                    className="w-full bg-gray-100 dark:bg-zinc-800 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-ios-primary/20"
                    value={webdavForm.user}
                    onChange={(e) => { setWebdavForm({...webdavForm, user: e.target.value}); setIsWebDavEditing(true); }}
                />
            </div>
            <div>
                <label className="text-xs font-medium text-ios-subtext ml-1 mb-1 block">密码 (Password)</label>
                <input 
                    type="password" 
                    placeholder="WebDAV 密码/应用授权码" 
                    className="w-full bg-gray-100 dark:bg-zinc-800 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-ios-primary/20"
                    value={webdavForm.pass}
                    onChange={(e) => { setWebdavForm({...webdavForm, pass: e.target.value}); setIsWebDavEditing(true); }}
                />
            </div>
            
            <div className="flex gap-3 pt-2">
                <button 
                    onClick={testConnection}
                    disabled={isTestingConnection}
                    type="button"
                    className="flex-1 py-2.5 bg-gray-100 dark:bg-zinc-800 text-ios-text text-sm font-medium rounded-xl active:bg-gray-200 dark:active:bg-zinc-700 transition-colors"
                >
                    {isTestingConnection ? '连接中...' : '测试连接'}
                </button>
                {isWebDavEditing && (
                    <button 
                        onClick={handleSaveWebDav}
                        type="button"
                        className="flex-1 py-2.5 bg-ios-primary text-white text-sm font-medium rounded-xl active:opacity-90 transition-opacity"
                    >
                        保存配置
                    </button>
                )}
            </div>
        </div>

        <div className="mx-4 mt-6">
            <h3 className="px-2 mb-2 text-xs font-semibold text-ios-subtext uppercase">手动操作</h3>
            <div className="grid grid-cols-2 gap-4">
                <button 
                    onClick={async () => {
                        // Check validation first
                        if (!webdavForm.url || !webdavForm.user || !webdavForm.pass) {
                            window.alert("WebDAV 配置不完整，无法备份。");
                            return;
                        }
                        // Use current input values for test
                        const tempService = new WebDAVService({ ...state.settings, webdavUrl: webdavForm.url, webdavUser: webdavForm.user, webdavPass: webdavForm.pass });
                        
                        setIsTestingConnection(true);
                        try {
                            await tempService.checkConnection();
                            setIsTestingConnection(false);
                            
                            // If modified, save first
                            if (isWebDavEditing) {
                                dispatch({ type: 'UPDATE_SETTINGS', payload: { webdavUrl: webdavForm.url, webdavUser: webdavForm.user, webdavPass: webdavForm.pass } });
                                setIsWebDavEditing(false);
                            }

                            if (!window.confirm("确定要将本地数据覆盖上传到云端吗？")) return;
                            setIsBackingUp(true);
                            await manualBackup();
                            window.alert("✅ 备份成功");

                        } catch(e:any) {
                            setIsTestingConnection(false);
                            window.alert(`❌ 连接或备份失败: ${e.message}`);
                        } finally {
                            setIsBackingUp(false);
                        }
                    }}
                    disabled={isBackingUp || isTestingConnection}
                    type="button"
                    className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-ios-border shadow-sm flex flex-col items-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
                >
                    <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-ios-primary">
                        <Icon name={isBackingUp ? "Loader2" : "CloudUpload"} className={cn("w-5 h-5", isBackingUp && "animate-spin")} />
                    </div>
                    <span className="text-sm font-medium">立即备份</span>
                    <span className="text-[10px] text-ios-subtext">本地 → 云端</span>
                </button>

                <button 
                    onClick={async () => {
                        if (!webdavForm.url || !webdavForm.user || !webdavForm.pass) {
                            window.alert("WebDAV 配置不完整，无法恢复。");
                            return;
                        }
                        
                         // Use current input values for test
                        const tempService = new WebDAVService({ ...state.settings, webdavUrl: webdavForm.url, webdavUser: webdavForm.user, webdavPass: webdavForm.pass });

                        setIsTestingConnection(true);
                        try {
                            await tempService.checkConnection();
                            setIsTestingConnection(false);

                            // If modified, save first
                            if (isWebDavEditing) {
                                dispatch({ type: 'UPDATE_SETTINGS', payload: { webdavUrl: webdavForm.url, webdavUser: webdavForm.user, webdavPass: webdavForm.pass } });
                                setIsWebDavEditing(false);
                            }

                            if (!window.confirm("确定要从云端恢复数据吗？\n警告：本地现有数据将被覆盖！")) return;
                            setIsRestoring(true);
                            await restoreFromCloud();
                            window.alert("✅ 恢复成功");

                        } catch(e:any) {
                            setIsTestingConnection(false);
                            window.alert(`❌ 连接或恢复失败: ${e.message}`);
                        } finally {
                            setIsRestoring(false);
                        }
                    }}
                    disabled={isRestoring || isTestingConnection}
                    type="button"
                    className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-ios-border shadow-sm flex flex-col items-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
                >
                    <div className="w-10 h-10 rounded-full bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center text-orange-500">
                        <Icon name={isRestoring ? "Loader2" : "CloudDownload"} className={cn("w-5 h-5", isRestoring && "animate-spin")} />
                    </div>
                    <span className="text-sm font-medium">从云端恢复</span>
                    <span className="text-[10px] text-ios-subtext">云端 → 本地</span>
                </button>
            </div>
        </div>
      </>
  );

  const renderLedgers = () => (
      <>
        <div className="h-4"></div>
        <div className="bg-white dark:bg-zinc-900 rounded-2xl mx-4 mt-2 shadow-sm border border-ios-border overflow-hidden">
            {state.ledgers.map((l, i) => (
                <div key={l.id} className={cn("p-4 flex items-center justify-between", i !== state.ledgers.length - 1 && "border-b border-gray-100 dark:border-zinc-800")}>
                    <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: l.themeColor }}></div>
                        <div className="flex flex-col">
                            <span className="font-medium text-sm">{l.name}</span>
                            <span className="text-[10px] text-ios-subtext">创建于 {format(l.createdAt, 'yyyy/MM/dd')}</span>
                        </div>
                        {state.currentLedgerId === l.id && <span className="text-[10px] bg-gray-100 dark:bg-zinc-800 px-2 py-0.5 rounded text-ios-subtext">当前</span>}
                    </div>
                    <div className="flex gap-2">
                         <button 
                            onClick={() => openExportDialog(l)} 
                            className="p-2 text-ios-subtext hover:text-ios-primary"
                            title="导出 CSV"
                         >
                            <Icon name="Download" className="w-4 h-4" />
                         </button>
                         <button onClick={() => openEditLedger(l)} className="p-2 text-ios-subtext hover:text-ios-primary"><Icon name="Edit2" className="w-4 h-4" /></button>
                         {state.ledgers.length > 1 && (
                            <button 
                                type="button"
                                onClick={(e) => handleDeleteLedger(e, l)}
                                className="p-2 text-ios-subtext hover:text-red-500 active:scale-90 transition-transform"
                            >
                                <Icon name="Trash2" className="w-4 h-4 pointer-events-none" />
                            </button>
                         )}
                    </div>
                </div>
            ))}
        </div>
        
        <div className="mx-4 mt-6">
            <h3 className="px-2 mb-2 text-xs font-semibold text-ios-subtext uppercase">导入数据</h3>
            <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl shadow-sm border border-ios-border">
                <p className="text-xs text-ios-subtext mb-3">支持导入标准 CSV 格式的账单数据到当前账本。</p>
                <label className="flex items-center justify-center w-full py-3 border-2 border-dashed border-gray-200 dark:border-zinc-700 rounded-xl text-sm text-ios-primary font-medium cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors">
                    <Icon name="Upload" className="w-4 h-4 mr-2" />
                    选择 CSV 文件
                    <input type="file" accept=".csv" className="hidden" onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                            const text = await file.text();
                            smartImportCsv(text, state.currentLedgerId);
                        }
                    }} />
                </label>
            </div>
        </div>

        {ledgerModal.isOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
                <div className="bg-white dark:bg-zinc-900 w-full max-w-xs rounded-2xl p-5 shadow-2xl animate-fade-in">
                    <h3 className="font-bold text-lg mb-4 text-center">{ledgerModal.mode === 'create' ? '新建账本' : '编辑账本'}</h3>
                    <input 
                        type="text" 
                        value={ledgerModal.name}
                        onChange={(e) => setLedgerModal({...ledgerModal, name: e.target.value})}
                        placeholder="账本名称"
                        className="w-full bg-gray-100 dark:bg-zinc-800 p-3 rounded-xl mb-4 text-sm outline-none"
                    />
                    <div className="flex gap-2 justify-center mb-6">
                        {THEME_PRESETS.map(c => (
                            <button 
                                key={c}
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setLedgerModal(prev => ({ ...prev, color: c }));
                                }}
                                className={cn(
                                    "w-6 h-6 rounded-full transition-transform border-2", 
                                    ledgerModal.color === c ? "scale-125 border-gray-400 dark:border-zinc-400" : "border-transparent"
                                )}
                                style={{ backgroundColor: c }}
                            />
                        ))}
                    </div>
                    <div className="flex gap-3">
                        <button onClick={() => setLedgerModal({...ledgerModal, isOpen: false})} className="flex-1 py-2.5 bg-gray-100 dark:bg-zinc-800 rounded-xl text-sm font-medium">取消</button>
                        <button onClick={saveLedger} className="flex-1 py-2.5 bg-ios-primary text-white rounded-xl text-sm font-medium">保存</button>
                    </div>
                </div>
            </div>
        )}
      </>
  );

  const renderCategories = () => (
      <>
        <div className="h-4"></div>
        <div className="flex items-center justify-between mx-4 mb-4">
            <div className="flex p-1 bg-gray-200 dark:bg-zinc-800 rounded-xl flex-1 mr-4">
                 <button onClick={() => setCatType('expense')} className={cn("flex-1 py-1.5 rounded-lg text-sm font-medium transition-all", catType === 'expense' ? "bg-white dark:bg-zinc-700 shadow-sm text-ios-text" : "text-ios-subtext")}>支出</button>
                 <button onClick={() => setCatType('income')} className={cn("flex-1 py-1.5 rounded-lg text-sm font-medium transition-all", catType === 'income' ? "bg-white dark:bg-zinc-700 shadow-sm text-ios-text" : "text-ios-subtext")}>收入</button>
            </div>
            <button 
                onClick={() => setIsReordering(!isReordering)}
                className={cn("px-4 py-1.5 rounded-xl text-sm font-medium transition-colors border", isReordering ? "bg-ios-primary text-white border-ios-primary" : "bg-white dark:bg-zinc-900 text-ios-primary border-gray-200 dark:border-zinc-700")}
            >
                {isReordering ? '完成' : '排序'}
            </button>
        </div>
        {isReordering && <p className="text-[11px] text-ios-subtext px-4 -mt-2 mb-2">拖动分类卡片即可调整顺序，也可用左右箭头微调。</p>}

        {/* Categories Grid */}
        <div className="px-4">
            <div className="grid grid-cols-4 gap-3">
                {sortedCategories.map((c, index) => (
                    <div 
                        key={c.id}
                        draggable={isReordering}
                        onDragStart={() => handleDragStart(index)}
                        onDragOver={handleDragOver}
                        onDrop={() => handleDrop(index)}
                        onDragEnd={handleDragEnd}
                        className={cn(
                            "relative group bg-white dark:bg-zinc-900 rounded-xl p-3 flex flex-col items-center justify-center gap-2 shadow-sm border border-ios-border aspect-square animate-fade-in",
                            isReordering && "cursor-move select-none",
                            dragIndex === index && isReordering ? "ring-2 ring-ios-primary/50" : ""
                        )}
                    >
                        <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center text-ios-primary">
                            <Icon name={c.icon} className="w-4 h-4" />
                        </div>
                        <span className="text-xs text-center truncate w-full">{c.name}</span>
                        
                        {isReordering ? (
                            <>
                                {/* Left/Up Arrow */}
                                <button 
                                    onClick={() => moveCategory(index, 'left')}
                                    disabled={index === 0}
                                    className="absolute left-0.5 top-1/2 -translate-y-1/2 p-1 text-ios-subtext disabled:opacity-20 hover:text-ios-primary active:scale-90 transition-transform"
                                >
                                    <Icon name="ChevronLeft" className="w-4 h-4" />
                                </button>
                                {/* Right/Down Arrow */}
                                <button 
                                    onClick={() => moveCategory(index, 'right')}
                                    disabled={index === sortedCategories.length - 1}
                                    className="absolute right-0.5 top-1/2 -translate-y-1/2 p-1 text-ios-subtext disabled:opacity-20 hover:text-ios-primary active:scale-90 transition-transform"
                                >
                                    <Icon name="ChevronRight" className="w-4 h-4" />
                                </button>
                            </>
                        ) : (
                            <button 
                                type="button"
                                onClick={(e) => handleDeleteCategory(e, c.id)}
                                className="absolute -top-2 -right-2 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center shadow-md z-20 active:scale-90 transition-transform"
                            >
                                <Icon name="X" className="w-3.5 h-3.5 pointer-events-none" />
                            </button>
                        )}
                    </div>
                ))}
                
                {!isReordering && (
                    <button 
                        onClick={() => setIsAddingCat(true)}
                        className="bg-gray-50 dark:bg-zinc-800/50 rounded-xl p-3 flex flex-col items-center justify-center gap-2 border border-dashed border-gray-300 dark:border-zinc-700 aspect-square text-ios-subtext hover:text-ios-primary hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                    >
                        <Icon name="Plus" className="w-6 h-6" />
                        <span className="text-xs">添加</span>
                    </button>
                )}
            </div>
        </div>

        {isAddingCat && (
            <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40 backdrop-blur-sm">
                <div className="bg-white dark:bg-zinc-900 rounded-t-3xl p-6 animate-slide-up h-[70vh] flex flex-col">
                    <div className="flex justify-between items-center mb-6">
                        <button onClick={() => setIsAddingCat(false)} className="text-ios-subtext">取消</button>
                        <h3 className="font-bold text-lg">添加{catType === 'expense' ? '支出' : '收入'}分类</h3>
                        <button onClick={handleAddCategory} className="text-ios-primary font-bold">完成</button>
                    </div>
                    
                    <div className="flex items-center gap-4 mb-6 bg-gray-50 dark:bg-zinc-800 p-4 rounded-2xl">
                        <div className="w-12 h-12 rounded-full bg-white dark:bg-zinc-700 shadow-sm flex items-center justify-center text-ios-primary">
                            <Icon name={newCatIcon} className="w-6 h-6" />
                        </div>
                        <input 
                            type="text" 
                            placeholder="分类名称" 
                            value={newCatName}
                            onChange={(e) => setNewCatName(e.target.value)}
                            className="flex-1 bg-transparent text-lg outline-none placeholder:text-gray-400"
                            autoFocus
                        />
                    </div>

                    <div className="flex-1 overflow-y-auto no-scrollbar">
                        <div className="grid grid-cols-6 gap-4 pb-10">
                            {AVAILABLE_ICONS.map(icon => (
                                <button 
                                    key={icon}
                                    onClick={() => setNewCatIcon(icon)}
                                    className={cn("aspect-square rounded-xl flex items-center justify-center transition-all", newCatIcon === icon ? "bg-ios-primary text-white shadow-lg scale-110" : "bg-gray-50 dark:bg-zinc-800 text-ios-subtext")}
                                >
                                    <Icon name={icon} className="w-5 h-5" />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        )}
      </>
  );

  const renderLayout = () => (
      <>
        <div className="h-4"></div>
        <div>
            <SettingsGroup title="记账键盘">
                <div className="p-4">
                    <div className="flex justify-between items-center mb-3">
                        <span className="font-medium text-sm text-ios-text">键盘区域高度</span>
                        <span className="text-ios-primary font-bold text-sm">{state.settings.keypadHeight || 40}%</span>
                    </div>
                    <input 
                        type="range" 
                        min="30" 
                        max="60" 
                        step="5" 
                        value={state.settings.keypadHeight || 40} 
                        onChange={(e) => dispatch({type: 'UPDATE_SETTINGS', payload: { keypadHeight: parseInt(e.target.value) }})}
                        className="w-full accent-ios-primary" 
                    />
                    <div className="flex justify-between text-[10px] text-ios-subtext mt-1">
                        <span>较小</span>
                        <span>较大</span>
                    </div>
                    <p className="text-[10px] text-ios-subtext mt-3 pt-3 border-t border-gray-100 dark:border-zinc-800">
                        调整记账页面底部数字键盘所占屏幕高度的百分比。
                    </p>
                </div>
            </SettingsGroup>

            <SettingsGroup title="分类图标">
                <div className="p-4 flex items-center justify-between">
                    <div className="flex flex-col">
                        <span className="font-medium text-sm text-ios-text">每行显示数量</span>
                        <span className="text-[10px] text-ios-subtext">记账页面的分类网格密度</span>
                    </div>
                    <div className="flex bg-gray-100 dark:bg-zinc-800 p-0.5 rounded-lg">
                        {[4, 5, 6].map(num => (
                            <button 
                                key={num}
                                onClick={() => dispatch({type: 'UPDATE_SETTINGS', payload: { categoryRows: num }})}
                                className={cn(
                                    "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                                    (state.settings.categoryRows || 5) === num ? "bg-white dark:bg-zinc-700 shadow-sm text-ios-text" : "text-ios-subtext"
                                )}
                            >
                                {num}列
                            </button>
                        ))}
                    </div>
                </div>
            </SettingsGroup>
            
            <SettingsGroup title="视觉效果">
                <div className="p-4 flex items-center justify-between">
                    <div className="flex flex-col">
                        <span className="font-medium text-sm text-ios-text">界面过渡动画</span>
                        <span className="text-[10px] text-ios-subtext">开启后切换页面会有滑动效果</span>
                    </div>
                    <button 
                        onClick={() => dispatch({type: 'UPDATE_SETTINGS', payload: { enableAnimations: !state.settings.enableAnimations }})}
                        className={cn("w-12 h-7 rounded-full transition-colors relative", state.settings.enableAnimations ? 'bg-ios-primary' : 'bg-gray-300 dark:bg-zinc-600')}
                    >
                        <div className={cn("absolute top-1 left-1 bg-white w-5 h-5 rounded-full shadow-sm transition-transform", state.settings.enableAnimations ? 'translate-x-5' : '')}></div>
                    </button>
                </div>
            </SettingsGroup>
        </div>
      </>
  );

  const renderHistory = () => (
      <>
        <div className="h-4"></div>
        {/* Removed internal scroll, let parent handle it */}
        <div className="p-4 space-y-3">
            {state.operationLogs.length === 0 ? (
                <div className="text-center py-10 text-ios-subtext">暂无操作记录</div>
            ) : (
                state.operationLogs.map(log => (
                    <div key={log.id} className="bg-white dark:bg-zinc-900 p-3 rounded-xl shadow-sm border border-ios-border flex justify-between items-center">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <span className={cn(
                                    "text-xs font-medium px-1.5 py-0.5 rounded",
                                    log.type === 'add' ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" :
                                    log.type === 'delete' ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400" :
                                    log.type === 'edit' ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400" :
                                    "bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-400"
                                )}>
                                    {log.type === 'add' ? '添加' : log.type === 'delete' ? '删除' : log.type === 'edit' ? '修改' : log.type === 'restore' ? '恢复' : '导入'}
                                </span>
                                <span className="text-xs text-ios-subtext">{format(log.timestamp, 'yyyy-MM-dd HH:mm:ss')}</span>
                            </div>
                            <div className="text-sm text-ios-text break-all">{log.details || '无详细信息'}</div>
                        </div>
                    </div>
                ))
            )}
        </div>
      </>
  );

  const renderTheme = () => (
      <>
        <div className="h-4"></div>
        <div>
            <SettingsGroup title="外观模式">
                {(['auto', 'light', 'dark'] as const).map((mode, i) => (
                    <SettingsItem 
                        key={mode}
                        icon={mode === 'auto' ? 'Smartphone' : mode === 'light' ? 'Sun' : 'Moon'}
                        label={mode === 'auto' ? '跟随系统' : mode === 'light' ? '浅色模式' : '深色模式'}
                        onClick={() => dispatch({type: 'SET_THEME_MODE', payload: mode})}
                        value={state.settings.themeMode === mode ? '当前' : ''}
                        isLast={i === 2}
                    />
                ))}
            </SettingsGroup>

            <SettingsGroup title="主题色">
                <div className="p-4 grid grid-cols-4 gap-4">
                    {THEME_PRESETS.map(color => (
                        <button 
                            key={color}
                            onClick={() => dispatch({type: 'UPDATE_SETTINGS', payload: { customThemeColor: color }})}
                            className={cn(
                                "aspect-square rounded-full flex items-center justify-center transition-transform",
                                state.settings.customThemeColor === color ? "scale-110 ring-2 ring-offset-2 ring-gray-300 dark:ring-zinc-600" : ""
                            )}
                            style={{ backgroundColor: color }}
                        >
                            {state.settings.customThemeColor === color && <Icon name="Check" className="w-5 h-5 text-white" />}
                        </button>
                    ))}
                </div>
            </SettingsGroup>
        </div>
      </>
  );

  const renderAbout = () => (
      <>
        <div className="flex flex-col items-center py-8">
            <div className="w-20 h-20 bg-ios-primary rounded-[1.5rem] flex items-center justify-center mb-4 shadow-xl shadow-blue-500/20">
                <Icon name="Wallet" className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-xl font-bold mb-1">个人记账本</h1>
            <p className="text-sm text-ios-subtext">v{state.settings.version}</p>
        </div>

        <div>
            <SettingsGroup title="更新日志">
                {UPDATE_LOGS.map((log, i) => (
                    <div key={i} className={cn("p-4", i !== UPDATE_LOGS.length - 1 && "border-b border-gray-100 dark:border-zinc-800")}>
                        <div className="flex justify-between items-center mb-2">
                            <span className="font-bold text-sm">v{log.version}</span>
                            <span className="text-xs text-ios-subtext">{log.date}</span>
                        </div>
                        <ul className="list-disc list-inside space-y-1">
                            {log.content.map((item, idx) => (
                                <li key={idx} className="text-xs text-ios-subtext">{item}</li>
                            ))}
                        </ul>
                    </div>
                ))}
            </SettingsGroup>
        </div>
      </>
  );

  const getPageTitle = () => {
      switch(page) {
          case 'main': return '设置';
          case 'security': return '云端备份';
          case 'ledgers': return '账本管理';
          case 'categories': return '分类管理';
          case 'history': return '操作历史';
          case 'layout': return '界面布局';
          case 'theme': return '主题设置';
          case 'about': return '关于';
          default: return '设置';
      }
  };

  return (
      <div 
        className={cn("h-full w-full bg-ios-bg", state.settings.enableAnimations && "animate-slide-up")}
      >
          {/* Header - Fixed/Absolute for Glass Effect */}
          <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-center pt-[env(safe-area-inset-top)] h-[calc(env(safe-area-inset-top)+3.5rem)] bg-ios-bg/80 backdrop-blur-xl border-b border-black/5 dark:border-white/5 transition-colors">
              
              {page !== 'main' && (
                  <button 
                    onClick={() => setPage('main')} 
                    className="absolute left-4 text-ios-primary flex items-center gap-1 active:opacity-60"
                  >
                      <Icon name="ChevronLeft" className="w-5 h-5" />
                      <span className="text-sm font-medium">返回</span>
                  </button>
              )}

              <h1 className="text-base font-semibold text-ios-text">{getPageTitle()}</h1>
              
              {page === 'ledgers' && (
                  <button onClick={openCreateLedger} className="absolute right-4 text-ios-primary text-sm font-medium active:opacity-60">新建</button>
              )}

              {page === 'main' && (
                <div className="absolute right-4">
                    <CloudSyncButton />
                </div>
              )}
          </div>

          {/* Scrollable Content */}
          <div 
            ref={scrollRef} 
            className="h-full w-full overflow-y-auto no-scrollbar overflow-x-hidden pt-[calc(env(safe-area-inset-top)+4.5rem)] pb-[calc(env(safe-area-inset-bottom)+6rem)]" 
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {page === 'main' && renderMainContent()}
            {page === 'security' && renderSecurity()}
            {page === 'ledgers' && renderLedgers()}
            {page === 'categories' && renderCategories()}
            {page === 'history' && renderHistory()}
            {page === 'layout' && renderLayout()}
            {page === 'theme' && renderTheme()}
            {page === 'about' && renderAbout()}
          </div>
          
          {showSyncLog && <SyncLogModal onClose={() => setShowSyncLog(false)} />}

          {/* Export Options Modal */}
          {exportModal.isOpen && (
            <div className="fixed inset-0 z-[60] flex flex-col items-center justify-end bg-black/40 backdrop-blur-sm animate-fade-in">
                <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-t-3xl p-6 shadow-2xl animate-slide-up pb-[calc(env(safe-area-inset-bottom)+1rem)]">
                    <div className="flex justify-between items-center mb-6">
                        <button onClick={() => setExportModal(prev => ({ ...prev, isOpen: false }))} className="text-ios-subtext">取消</button>
                        <h3 className="font-bold text-lg">导出账单 (CSV)</h3>
                        <button onClick={runExport} className="text-ios-primary font-bold">导出</button>
                    </div>

                    <div className="space-y-6 max-h-[70vh] overflow-y-auto no-scrollbar pb-6">
                        {/* Ledger Selection */}
                        <div className="space-y-3">
                            <span className="font-medium text-sm text-ios-text">选择账本</span>
                            <div className="bg-gray-50 dark:bg-zinc-800 rounded-xl overflow-hidden">
                                {state.ledgers.map(l => {
                                    const isSelected = exportModal.selectedLedgerIds.has(l.id);
                                    return (
                                        <button 
                                            key={l.id}
                                            onClick={() => {
                                                const newSet = new Set(exportModal.selectedLedgerIds);
                                                if (newSet.has(l.id)) newSet.delete(l.id);
                                                else newSet.add(l.id);
                                                setExportModal(prev => ({ ...prev, selectedLedgerIds: newSet }));
                                            }}
                                            className="w-full flex items-center justify-between p-3 border-b border-gray-100 dark:border-zinc-700/50 last:border-0 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: l.themeColor }}></div>
                                                <span className="text-sm">{l.name}</span>
                                            </div>
                                            {isSelected && <Icon name="Check" className="w-4 h-4 text-ios-primary" />}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Date Range Selection */}
                        <div className="space-y-3">
                            <span className="font-medium text-sm text-ios-text">时间范围</span>
                            <div className="flex bg-gray-100 dark:bg-zinc-800 p-1 rounded-xl">
                                {(['all', 'month', 'year', 'custom'] as const).map(mode => (
                                    <button
                                        key={mode}
                                        onClick={() => setExportModal(prev => ({ ...prev, rangeMode: mode }))}
                                        className={cn(
                                            "flex-1 py-2 text-xs font-medium rounded-lg transition-all",
                                            exportModal.rangeMode === mode ? "bg-white dark:bg-zinc-700 shadow-sm text-ios-text" : "text-ios-subtext"
                                        )}
                                    >
                                        {mode === 'all' ? '全部' : mode === 'month' ? '本月' : mode === 'year' ? '本年' : '自定义'}
                                    </button>
                                ))}
                            </div>

                            {/* Custom Date Inputs */}
                            {exportModal.rangeMode === 'custom' && (
                                <div className="flex items-center gap-2 animate-fade-in">
                                    <div className="flex-1 bg-gray-50 dark:bg-zinc-800 p-3 rounded-xl flex flex-col gap-1">
                                        <label className="text-[10px] text-ios-subtext">开始日期</label>
                                        <input 
                                            type="date" 
                                            className="bg-transparent text-sm outline-none text-ios-text"
                                            value={exportModal.customStart}
                                            onChange={(e) => setExportModal(prev => ({ ...prev, customStart: e.target.value }))}
                                        />
                                    </div>
                                    <Icon name="ArrowRight" className="w-4 h-4 text-ios-subtext" />
                                    <div className="flex-1 bg-gray-50 dark:bg-zinc-800 p-3 rounded-xl flex flex-col gap-1">
                                        <label className="text-[10px] text-ios-subtext">结束日期</label>
                                        <input 
                                            type="date" 
                                            className="bg-transparent text-sm outline-none text-ios-text"
                                            value={exportModal.customEnd}
                                            onChange={(e) => setExportModal(prev => ({ ...prev, customEnd: e.target.value }))}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
          )}
      </div>
  );
};
