
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { Icon } from './ui/Icon';
import { CloudSyncButton } from './CloudSyncButton';
import { THEME_PRESETS, AVAILABLE_ICONS } from '../constants';
import { UPDATE_LOGS } from '../changelog';
import { generateId, exportToJson, exportToCsv, cn, readCsvFileWithEncoding } from '../utils';
import { WebDAVService } from '../services/webdav';
import { format } from 'date-fns';
import { SyncLogModal } from './SyncLogModal';
import { Ledger, Category } from '../types';

type SettingsPage = 'main' | 'security' | 'ledgers' | 'categories' | 'history' | 'layout' | 'theme' | 'about';

const SettingsGroup: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="flex flex-col mb-6">
    <h3 className="px-4 mb-2 text-xs font-semibold text-ios-subtext uppercase tracking-wider">{title}</h3>
    <div className="bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden mx-4 shadow-sm border border-ios-border">
      {children}
    </div>
  </div>
);

const SettingsItem: React.FC<{ icon: string; label: string; value?: string; onClick: () => void; isLast?: boolean }> = ({ icon, label, value, onClick, isLast }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'w-full flex items-center justify-between p-4 active:bg-gray-50 dark:active:bg-zinc-800 transition-colors',
      !isLast && 'border-b border-gray-100 dark:border-zinc-800/50'
    )}
  >
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
  const { state, dispatch, manualBackup, restoreFromCloud, smartImportCsv, manualCloudSync, resetApp } = useApp();
  const [page, setPage] = useState<SettingsPage>('main');
  const scrollRef = useRef<HTMLDivElement>(null);

  const [webdavForm, setWebdavForm] = useState({
    url: state.settings.webdavUrl || '',
    user: state.settings.webdavUser || '',
    pass: state.settings.webdavPass || '',
  });
  const [isWebDavEditing, setIsWebDavEditing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);

  const [d1Form, setD1Form] = useState({
    endpoint: state.settings.syncEndpoint || '',
    token: state.settings.syncToken || '',
    userId: state.settings.syncUserId || 'default',
  });
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [reminderDays, setReminderDays] = useState<number>(state.settings.backupReminderDays ?? 7);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState<boolean>(state.settings.backupAutoEnabled ?? false);
  const [autoBackupDays, setAutoBackupDays] = useState<number>(state.settings.backupIntervalDays ?? 7);

  const [showSyncLog, setShowSyncLog] = useState(false);
  const [ledgerModal, setLedgerModal] = useState<{ isOpen: boolean; mode: 'create' | 'edit'; id?: string; name: string; color: string }>(
    { isOpen: false, mode: 'create', name: '', color: '#007AFF' }
  );
  const [catType, setCatType] = useState<'expense' | 'income'>('expense');
  const [isAddingCat, setIsAddingCat] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('Circle');
  const [isReordering, setIsReordering] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [page]);

  useEffect(() => {
    if (!isWebDavEditing) {
      setWebdavForm({
        url: state.settings.webdavUrl || '',
        user: state.settings.webdavUser || '',
        pass: state.settings.webdavPass || '',
      });
    }
    setD1Form({
      endpoint: state.settings.syncEndpoint || '',
      token: state.settings.syncToken || '',
      userId: state.settings.syncUserId || 'default',
    });
    setReminderDays(state.settings.backupReminderDays ?? 7);
    setAutoBackupEnabled(state.settings.backupAutoEnabled ?? false);
    setAutoBackupDays(state.settings.backupIntervalDays ?? 7);
  }, [state.settings, isWebDavEditing]);

  const sortedCategories = useMemo(() => {
    return state.categories
      .filter((c) => c.type === catType)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [state.categories, catType]);
  const handleSaveD1 = () => {
    if (!d1Form.endpoint.trim() || !d1Form.token.trim()) {
      window.alert('请填写同步地址和 AUTH_TOKEN');
      return;
    }
    dispatch({
      type: 'UPDATE_SETTINGS',
      payload: {
        syncEndpoint: d1Form.endpoint.trim(),
        syncToken: d1Form.token.trim(),
        syncUserId: d1Form.userId.trim() || 'default',
      },
    });
    window.alert('已保存 D1/KV 同步配置');
  };

  const handleManualCloudSync = async () => {
    if (!d1Form.endpoint.trim() || !d1Form.token.trim()) {
      window.alert('请先在“云同步”里填好地址和 AUTH_TOKEN');
      return;
    }
    setIsManualSyncing(true);
    try {
      await manualCloudSync();
      window.alert('手动同步完成');
    } catch (e: any) {
      window.alert(e?.message || '同步失败');
    } finally {
      setIsManualSyncing(false);
    }
  };

  const handleSaveWebDav = () => {
    const { url, user, pass } = webdavForm;
    dispatch({
      type: 'UPDATE_SETTINGS',
      payload: {
        webdavUrl: url,
        webdavUser: user,
        webdavPass: pass,
        enableCloudSync: false,
        backupReminderDays: reminderDays,
        backupAutoEnabled: autoBackupEnabled,
        backupIntervalDays: autoBackupDays,
      },
    });
    setIsWebDavEditing(false);
    window.alert('设置已保存');
  };

  const testConnection = async () => {
    setIsTestingConnection(true);
    try {
      const tempService = new WebDAVService({ ...state.settings, webdavUrl: webdavForm.url, webdavUser: webdavForm.user, webdavPass: webdavForm.pass });
      await tempService.checkConnection();
      window.alert('连接成功');
    } catch (e: any) {
      window.alert(e?.message || '连接失败');
    } finally {
      setIsTestingConnection(false);
    }
  };

  const openCreateLedger = () => setLedgerModal({ isOpen: true, mode: 'create', name: '', color: '#007AFF' });
  const openEditLedger = (l: Ledger) => setLedgerModal({ isOpen: true, mode: 'edit', id: l.id, name: l.name, color: l.themeColor });

  const saveLedger = () => {
    if (!ledgerModal.name.trim()) {
      window.alert('请输入账本名称');
      return;
    }
    if (ledgerModal.mode === 'create') {
      dispatch({ type: 'ADD_LEDGER', payload: { id: generateId(), name: ledgerModal.name, themeColor: ledgerModal.color, createdAt: Date.now() } });
    } else if (ledgerModal.mode === 'edit' && ledgerModal.id) {
      const original = state.ledgers.find((l) => l.id === ledgerModal.id);
      if (original) dispatch({ type: 'UPDATE_LEDGER', payload: { ...original, name: ledgerModal.name, themeColor: ledgerModal.color } });
    }
    setLedgerModal({ ...ledgerModal, isOpen: false });
  };

  const handleDeleteLedger = (l: Ledger) => {
    if (state.ledgers.length <= 1) {
      window.alert('至少保留一个账本');
      return;
    }
    if (!window.confirm(`删除账本 “${l.name}”？本地数据将被清空。`)) return;
    dispatch({ type: 'DELETE_LEDGER', payload: l.id });
  };

  const openExportDialog = (l?: Ledger) => {
    const targetIds = l ? [l.id] : state.ledgers.map((x) => x.id);
    const targetTxs = state.transactions.filter((t) => targetIds.includes(t.ledgerId));
    if (targetTxs.length === 0) {
      window.alert('暂无可导出的记录');
      return;
    }
    const filename = l ? `${l.name}_${format(new Date(), 'yyyyMMdd_HHmm')}.csv` : `export_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`;
    exportToCsv(targetTxs, state.categories, state.ledgers, filename);
  };

  const handleAddCategory = () => {
    if (!newCatName.trim()) {
      window.alert('请输入分类名称');
      return;
    }
    const order = Math.max(-1, ...state.categories.filter((c) => c.type === catType).map((c) => c.order ?? 0)) + 1;
    dispatch({
      type: 'ADD_CATEGORY',
      payload: {
        id: generateId(),
        name: newCatName,
        icon: newCatIcon,
        type: catType,
        order,
        isCustom: true,
        updatedAt: Date.now(),
      },
    });
    setIsAddingCat(false);
    setNewCatName('');
    setNewCatIcon('Circle');
  };

  const openEditCategory = (c: Category) => {
    setEditingCat(c);
    setNewCatName(c.name);
    setNewCatIcon(c.icon);
  };

  const saveEditCategory = () => {
    if (!editingCat) return;
    dispatch({ type: 'UPDATE_CATEGORY', payload: { ...editingCat, name: newCatName, icon: newCatIcon, updatedAt: Date.now() } });
    setEditingCat(null);
    setNewCatName('');
    setNewCatIcon('Circle');
  };

  const handleDeleteCategory = (id: string) => {
    if (!window.confirm('确定删除该分类吗？已有账目会保留分类引用。')) return;
    dispatch({ type: 'DELETE_CATEGORY', payload: id });
  };

  const moveCategory = (index: number, direction: 'left' | 'right') => {
    const list = [...sortedCategories];
    const swapIndex = direction === 'left' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= list.length) return;
    [list[index], list[swapIndex]] = [list[swapIndex], list[index]];
    const normalized = list.map((c, i) => ({ ...c, order: i, updatedAt: Date.now() }));
    dispatch({ type: 'REORDER_CATEGORIES', payload: normalized });
  };

  const handleDragStart = (idx: number) => setDragIndex(idx);
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDragEnd = () => setDragIndex(null);
  const handleDrop = (idx: number) => {
    if (dragIndex === null) return;
    const list = [...sortedCategories];
    const [item] = list.splice(dragIndex, 1);
    list.splice(idx, 0, item);
    const normalized = list.map((c, i) => ({ ...c, order: i, updatedAt: Date.now() }));
    dispatch({ type: 'REORDER_CATEGORIES', payload: normalized });
    setDragIndex(null);
  };
  const renderMainContent = () => (
    <>
      <div className="h-4"></div>
      <SettingsGroup title="同步与备份">
        <SettingsItem icon="Cloud" label="D1+KV 云同步" value={state.settings.syncEndpoint ? '已配置' : '未配置'} onClick={() => setPage('security')} />
        <SettingsItem icon="RefreshCw" label={isManualSyncing ? '正在同步…' : '立即手动同步'} onClick={handleManualCloudSync} />
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
        <SettingsItem icon="Download" label="导出数据 (JSON)" onClick={() => exportToJson(state, `ledger_backup_${format(new Date(), 'yyyyMMdd_HHmm')}.json`)} />
        <SettingsItem icon="Info" label="关于" value={`v${state.settings.version}`} onClick={() => setPage('about')} isLast />
      </SettingsGroup>

      <SettingsGroup title="退出与重置">
        <div className="p-4">
          <p className="text-xs text-ios-subtext mb-3">清空本地数据并移除 D1+KV / WebDAV 配置，恢复到首次使用状态。</p>
          <button
            onClick={resetApp}
            className="w-full py-3 rounded-xl bg-red-500 text-white text-sm font-semibold active:scale-95 transition-transform"
          >
            退出并清空本地数据
          </button>
        </div>
      </SettingsGroup>
    </>
  );

  const renderSecurity = () => (
    <>
      <div className="h-4"></div>

      <div className="bg-white dark:bg-zinc-900 rounded-2xl mx-4 shadow-sm border border-ios-border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold">D1 + KV 云同步</div>
            <p className="text-xs text-ios-subtext">填写 Worker 地址和 AUTH_TOKEN，修改数据自动同步，也可手动同步。</p>
          </div>
          <span className="text-xs text-ios-subtext">{state.settings.syncEndpoint ? '已配置' : '未配置'}</span>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-ios-subtext ml-1 mb-1 block">同步地址</label>
            <input
              type="text"
              placeholder="https://sync.xxx.workers.dev"
              className="w-full bg-gray-100 dark:bg-zinc-800 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-ios-primary/20"
              value={d1Form.endpoint}
              onChange={(e) => setD1Form({ ...d1Form, endpoint: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-ios-subtext ml-1 mb-1 block">AUTH_TOKEN</label>
            <input
              type="password"
              placeholder="云端设置的密钥"
              className="w-full bg-gray-100 dark:bg-zinc-800 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-ios-primary/20"
              value={d1Form.token}
              onChange={(e) => setD1Form({ ...d1Form, token: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-ios-subtext ml-1 mb-1 block">用户标识（多设备保持一致）</label>
            <input
              type="text"
              placeholder="default"
              className="w-full bg-gray-100 dark:bg-zinc-800 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-ios-primary/20"
              value={d1Form.userId}
              onChange={(e) => setD1Form({ ...d1Form, userId: e.target.value })}
            />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={handleSaveD1}
            type="button"
            className="flex-1 py-2.5 bg-ios-primary text-white text-sm font-medium rounded-xl active:opacity-90 transition-opacity"
          >
            保存配置
          </button>
          <button
            onClick={handleManualCloudSync}
            type="button"
            disabled={isManualSyncing}
            className="flex-1 py-2.5 bg-emerald-500 text-white text-sm font-medium rounded-xl active:opacity-90 transition-opacity disabled:opacity-60"
          >
            {isManualSyncing ? '同步中…' : '手动同步'}
          </button>
          <button
            onClick={() => setShowSyncLog(true)}
            type="button"
            className="flex-1 py-2.5 bg-gray-100 dark:bg-zinc-800 text-sm font-medium rounded-xl"
          >
            查看日志
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-2xl mx-4 mt-6 shadow-sm border border-ios-border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold">WebDAV 手动备份</div>
            <p className="text-xs text-ios-subtext">已关闭自动同步，仅保留手动备份/恢复，并可提醒。</p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-ios-subtext ml-1 mb-1 block">服务器地址 (URL)</label>
            <input
              type="text"
              placeholder="https://dav.example.com/remote.php/webdav"
              className="w-full bg-gray-100 dark:bg-zinc-800 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-ios-primary/20"
              value={webdavForm.url}
              onChange={(e) => { setWebdavForm({ ...webdavForm, url: e.target.value }); setIsWebDavEditing(true); }}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-ios-subtext ml-1 mb-1 block">账号 (User)</label>
            <input
              type="text"
              className="w-full bg-gray-100 dark:bg-zinc-800 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-ios-primary/20"
              value={webdavForm.user}
              onChange={(e) => { setWebdavForm({ ...webdavForm, user: e.target.value }); setIsWebDavEditing(true); }}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-ios-subtext ml-1 mb-1 block">密码 / 应用密钥</label>
            <input
              type="password"
              className="w-full bg-gray-100 dark:bg-zinc-800 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-ios-primary/20"
              value={webdavForm.pass}
              onChange={(e) => { setWebdavForm({ ...webdavForm, pass: e.target.value }); setIsWebDavEditing(true); }}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-ios-subtext ml-1 mb-1 block">备份提醒天数（0 表示关闭提醒）</label>
            <input
              type="number"
              min={0}
              max={60}
              className="w-full bg-gray-100 dark:bg-zinc-800 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-ios-primary/20"
              value={reminderDays}
              onChange={(e) => { const v = Math.max(0, Math.min(60, Number(e.target.value) || 0)); setReminderDays(v); setIsWebDavEditing(true); }}
            />
          </div>
          <div className="flex items-center justify-between bg-gray-100 dark:bg-zinc-800 p-3 rounded-xl">
            <div>
              <p className="text-sm font-medium text-ios-text">定期自动备份</p>
              <p className="text-xs text-ios-subtext">按设定天数自动备份，执行前会先同步 D1+KV。</p>
            </div>
            <input
              type="checkbox"
              checked={autoBackupEnabled}
              onChange={(e) => { setAutoBackupEnabled(e.target.checked); setIsWebDavEditing(true); }}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-ios-subtext ml-1 mb-1 block">自动备份间隔（天）</label>
            <input
              type="number"
              min={1}
              max={60}
              disabled={!autoBackupEnabled}
              className="w-full bg-gray-100 dark:bg-zinc-800 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-ios-primary/20 disabled:opacity-60"
              value={autoBackupDays}
              onChange={(e) => { const v = Math.max(1, Math.min(60, Number(e.target.value) || 1)); setAutoBackupDays(v); setIsWebDavEditing(true); }}
            />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={testConnection}
            disabled={isTestingConnection}
            type="button"
            className="flex-1 py-2.5 bg-gray-100 dark:bg-zinc-800 text-ios-text text-sm font-medium rounded-xl active:bg-gray-200 dark:active:bg-zinc-700 transition-colors disabled:opacity-60"
          >
            {isTestingConnection ? '连接中…' : '测试连接'}
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

        <div className="grid grid-cols-2 gap-4 pt-2">
          <button
            onClick={async () => {
              if (!webdavForm.url || !webdavForm.user || !webdavForm.pass) {
                window.alert('WebDAV 配置不完整，无法备份');
                return;
              }
              if (isWebDavEditing) handleSaveWebDav();
              if (!window.confirm('确定将本地数据上传备份到云端？')) return;
              setIsBackingUp(true);
              try {
                await manualBackup();
                window.alert('备份成功');
              } catch (e: any) {
                window.alert(e?.message || '备份失败');
              } finally {
                setIsBackingUp(false);
              }
            }}
            disabled={isBackingUp}
            type="button"
            className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-ios-border shadow-sm flex flex-col items-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
          >
            <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-ios-primary">
              <Icon name={isBackingUp ? 'Loader2' : 'CloudUpload'} className={cn('w-5 h-5', isBackingUp && 'animate-spin')} />
            </div>
            <span className="text-sm font-medium">立即备份</span>
            <span className="text-[10px] text-ios-subtext">本地 → 云端</span>
          </button>

          <button
            onClick={async () => {
              if (!webdavForm.url || !webdavForm.user || !webdavForm.pass) {
                window.alert('WebDAV 配置不完整，无法恢复');
                return;
              }
              if (isWebDavEditing) handleSaveWebDav();
              if (!window.confirm('从云端恢复并覆盖本地数据？')) return;
              setIsRestoring(true);
              try {
                await restoreFromCloud();
                window.alert('恢复成功');
              } catch (e: any) {
                window.alert(e?.message || '恢复失败');
              } finally {
                setIsRestoring(false);
              }
            }}
            disabled={isRestoring}
            type="button"
            className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-ios-border shadow-sm flex flex-col items-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
          >
            <div className="w-10 h-10 rounded-full bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center text-orange-500">
              <Icon name={isRestoring ? 'Loader2' : 'CloudDownload'} className={cn('w-5 h-5', isRestoring && 'animate-spin')} />
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
          <div key={l.id} className={cn('p-4 flex items-center justify-between', i !== state.ledgers.length - 1 && 'border-b border-gray-100 dark:border-zinc-800')}>
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: l.themeColor }}></div>
              <div className="flex flex-col">
                <span className="font-medium text-sm">{l.name}</span>
                <span className="text-[10px] text-ios-subtext">创建于 {format(l.createdAt, 'yyyy/MM/dd')}</span>
              </div>
              {state.currentLedgerId === l.id && <span className="text-[10px] bg-gray-100 dark:bg-zinc-800 px-2 py-0.5 rounded text-ios-subtext">当前</span>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => openExportDialog(l)} className="p-2 text-ios-subtext hover:text-ios-primary" title="导出 CSV">
                <Icon name="Download" className="w-4 h-4" />
              </button>
              <button onClick={() => openEditLedger(l)} className="p-2 text-ios-subtext hover:text-ios-primary">
                <Icon name="Edit2" className="w-4 h-4" />
              </button>
              {state.ledgers.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleDeleteLedger(l)}
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
          <p className="text-xs text-ios-subtext mb-3">支持导入 CSV 账单数据到当前账本。</p>
          <label className="flex items-center justify-center w-full py-3 border-2 border-dashed border-gray-200 dark:border-zinc-700 rounded-xl text-sm text-ios-primary font-medium cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors">
            <Icon name="Upload" className="w-4 h-4 mr-2" />
            选择 CSV 文件
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const text = await readCsvFileWithEncoding(file);
                  smartImportCsv(text, state.currentLedgerId);
                }
              }}
            />
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
              onChange={(e) => setLedgerModal({ ...ledgerModal, name: e.target.value })}
              placeholder="账本名称"
              className="w-full bg-gray-100 dark:bg-zinc-800 p-3 rounded-xl mb-4 text-sm outline-none"
            />
            <div className="flex gap-2 justify-center mb-6">
              {THEME_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setLedgerModal((prev) => ({ ...prev, color: c }));
                  }}
                  className={cn(
                    'w-6 h-6 rounded-full transition-transform border-2',
                    ledgerModal.color === c ? 'scale-125 border-gray-400 dark:border-zinc-400' : 'border-transparent'
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setLedgerModal({ ...ledgerModal, isOpen: false })} className="flex-1 py-2.5 bg-gray-100 dark:bg-zinc-800 rounded-xl text-sm font-medium">
                取消
              </button>
              <button onClick={saveLedger} className="flex-1 py-2.5 bg-ios-primary text-white rounded-xl text-sm font-medium">
                保存
              </button>
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
          <button onClick={() => setCatType('expense')} className={cn('flex-1 py-1.5 rounded-lg text-sm font-medium transition-all', catType === 'expense' ? 'bg-white dark:bg-zinc-700 shadow-sm text-ios-text' : 'text-ios-subtext')}>
            支出
          </button>
          <button onClick={() => setCatType('income')} className={cn('flex-1 py-1.5 rounded-lg text-sm font-medium transition-all', catType === 'income' ? 'bg-white dark:bg-zinc-700 shadow-sm text-ios-text' : 'text-ios-subtext')}>
            收入
          </button>
        </div>
        <button
          onClick={() => setIsReordering(!isReordering)}
          className={cn(
            'px-4 py-1.5 rounded-xl text-sm font-medium transition-colors border',
            isReordering ? 'bg-ios-primary text-white border-ios-primary' : 'bg-white dark:bg-zinc-900 text-ios-primary border-gray-200 dark:border-zinc-700'
          )}
        >
          {isReordering ? '完成' : '排序'}
        </button>
      </div>
      {isReordering && <p className="text-[11px] text-ios-subtext px-4 -mt-2 mb-2">拖动或点击箭头调整顺序</p>}

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
                'relative group bg-white dark:bg-zinc-900 rounded-xl p-3 flex flex-col items-center justify-center gap-2 shadow-sm border border-ios-border aspect-square animate-fade-in',
                isReordering && 'cursor-move select-none',
                dragIndex === index && isReordering ? 'ring-2 ring-ios-primary/50' : ''
              )}
              onClick={() => {
                if (!isReordering) openEditCategory(c);
              }}
            >
              <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center text-ios-primary">
                <Icon name={c.icon} className="w-4 h-4" />
              </div>
              <span className="text-xs text-center truncate w-full">{c.name}</span>

              {isReordering ? (
                <>
                  <button
                    onClick={() => moveCategory(index, 'left')}
                    disabled={index === 0}
                    className="absolute left-0.5 top-1/2 -translate-y-1/2 p-1 text-ios-subtext disabled:opacity-20 hover:text-ios-primary active:scale-90 transition-transform"
                  >
                    <Icon name="ChevronLeft" className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => moveCategory(index, 'right')}
                    disabled={index === sortedCategories.length - 1}
                    className="absolute right-0.5 top-1/2 -translate-y-1/2 p-1 text-ios-subtext disabled:opacity-20 hover:text-ios-primary active:scale-90 transition-transform"
                  >
                    <Icon name="ChevronRight" className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteCategory(c.id);
                    }}
                    className="absolute -top-2 -right-2 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center shadow-md z-20 active:scale-90 transition-transform"
                  >
                    <Icon name="X" className="w-3.5 h-3.5 pointer-events-none" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditCategory(c);
                    }}
                    className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-1 text-[10px] bg-ios-primary text-white rounded-full shadow-md"
                  >
                    编辑
                  </button>
                </>
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
                {AVAILABLE_ICONS.map((icon) => (
                  <button
                    key={icon}
                    onClick={() => setNewCatIcon(icon)}
                    className={cn(
                      'aspect-square rounded-xl flex items-center justify-center transition-all',
                      newCatIcon === icon ? 'bg-ios-primary text-white shadow-lg scale-110' : 'bg-gray-50 dark:bg-zinc-800 text-ios-subtext'
                    )}
                  >
                    <Icon name={icon} className="w-5 h-5" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {editingCat && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 rounded-t-3xl p-6 animate-slide-up h-[70vh] flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <button
                onClick={() => {
                  setEditingCat(null);
                  setNewCatName('');
                  setNewCatIcon('Circle');
                }}
                className="text-ios-subtext"
              >
                取消
              </button>
              <h3 className="font-bold text-lg">编辑分类</h3>
              <button onClick={saveEditCategory} className="text-ios-primary font-bold">保存</button>
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
                {AVAILABLE_ICONS.map((icon) => (
                  <button
                    key={icon}
                    onClick={() => setNewCatIcon(icon)}
                    className={cn(
                      'aspect-square rounded-xl flex items-center justify-center transition-all',
                      newCatIcon === icon ? 'bg-ios-primary text-white shadow-lg scale-110' : 'bg-gray-50 dark:bg-zinc-800 text-ios-subtext'
                    )}
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
  const renderHistory = () => (
    <div className="px-4 pb-8">
      <div className="h-4"></div>
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-ios-border overflow-hidden">
        {state.operationLogs.length === 0 && <p className="p-4 text-sm text-ios-subtext">暂无操作记录</p>}
        {state.operationLogs.map((log) => (
          <div key={log.id} className="p-4 border-b border-gray-100 dark:border-zinc-800 last:border-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium">{log.type}</span>
              <span className="text-[10px] text-ios-subtext">{format(log.timestamp, 'yyyy/MM/dd HH:mm')}</span>
            </div>
            <p className="text-xs text-ios-subtext">{log.details || log.targetId}</p>
          </div>
        ))}
      </div>
    </div>
  );

  const renderLayout = () => (
    <div className="px-4 pb-10">
      <div className="h-4"></div>
      <SettingsGroup title="键盘与网格">
        <div className="p-4 space-y-4">
          <div>
            <div className="flex justify-between items-center text-sm mb-2">
              <span>数字键盘高度</span>
              <span className="text-ios-subtext">{state.settings.keypadHeight}%</span>
            </div>
            <input
              type="range"
              min={20}
              max={60}
              value={state.settings.keypadHeight}
              onChange={(e) => dispatch({ type: 'UPDATE_SETTINGS', payload: { keypadHeight: Number(e.target.value) } })}
              className="w-full"
            />
          </div>
          <div>
            <div className="flex justify-between items-center text-sm mb-2">
              <span>分类每行数量</span>
              <span className="text-ios-subtext">{state.settings.categoryRows} 个</span>
            </div>
            <input
              type="range"
              min={4}
              max={6}
              value={state.settings.categoryRows}
              onChange={(e) => dispatch({ type: 'UPDATE_SETTINGS', payload: { categoryRows: Number(e.target.value) } })}
              className="w-full"
            />
          </div>
        </div>
      </SettingsGroup>
    </div>
  );

  const renderTheme = () => (
    <div className="px-4 pb-10">
      <div className="h-4"></div>
      <SettingsGroup title="主题模式">
        <div className="p-4 flex gap-3">
          {(['auto', 'light', 'dark'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => dispatch({ type: 'SET_THEME_MODE', payload: mode })}
              className={cn(
                'flex-1 py-2.5 rounded-xl border text-sm font-medium',
                state.settings.themeMode === mode ? 'border-ios-primary text-ios-primary' : 'border-gray-200 dark:border-zinc-700'
              )}
            >
              {mode === 'auto' ? '自动' : mode === 'light' ? '浅色' : '深色'}
            </button>
          ))}
        </div>
      </SettingsGroup>

      <SettingsGroup title="主题色">
        <div className="p-4 grid grid-cols-6 gap-3">
          {THEME_PRESETS.map((color) => (
            <button
              key={color}
              onClick={() => dispatch({ type: 'UPDATE_SETTINGS', payload: { customThemeColor: color } })}
              className={cn(
                'aspect-square rounded-full flex items-center justify-center transition-transform',
                state.settings.customThemeColor === color ? 'scale-110 ring-2 ring-offset-2 ring-gray-300 dark:ring-zinc-600' : ''
              )}
              style={{ backgroundColor: color }}
            >
              {state.settings.customThemeColor === color && <Icon name="Check" className="w-5 h-5 text-white" />}
            </button>
          ))}
        </div>
      </SettingsGroup>
    </div>
  );

  const renderAbout = () => (
    <>
      <div className="flex flex-col items-center py-8">
        <div className="w-20 h-20 bg-ios-primary rounded-[1.5rem] flex items-center justify-center mb-4 shadow-xl shadow-blue-500/20">
          <Icon name="Wallet" className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-xl font-bold mb-1">个人记账本</h1>
      </div>

      <div className="px-4 pb-10">
        <SettingsGroup title="更新日志">
          {UPDATE_LOGS.map((log, i) => (
            <div key={i} className={cn('p-4', i !== UPDATE_LOGS.length - 1 && 'border-b border-gray-100 dark:border-zinc-800')}>
              <div className="flex justify-between items-center mb-2">
                <span className="font-bold text-sm">v{log.version}</span>
                <span className="text-xs text-ios-subtext">{log.date}</span>
              </div>
              <ul className="list-disc list-inside space-y-1">
                {log.content.map((item, idx) => (
                  <li key={idx} className="text-xs text-ios-subtext">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </SettingsGroup>
      </div>
    </>
  );

  const getPageTitle = () => {
    switch (page) {
      case 'main':
        return '设置';
      case 'security':
        return '云同步与备份';
      case 'ledgers':
        return '账本管理';
      case 'categories':
        return '分类管理';
      case 'history':
        return '操作历史';
      case 'layout':
        return '界面布局';
      case 'theme':
        return '主题设置';
      case 'about':
        return '关于';
      default:
        return '设置';
    }
  };

  return (
    <div className={cn('h-full w-full bg-ios-bg', state.settings.enableAnimations && 'animate-slide-up')}>
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-center pt-[env(safe-area-inset-top)] h-[calc(env(safe-area-inset-top)+3.5rem)] bg-ios-bg/80 backdrop-blur-xl border-b border-black/5 dark:border-white/5 transition-colors">
        {page !== 'main' && (
          <button onClick={() => setPage('main')} className="absolute left-4 text-ios-primary flex items-center gap-1 active:opacity-60">
            <Icon name="ChevronLeft" className="w-5 h-5" />
            <span className="text-sm font-medium">返回</span>
          </button>
        )}

        <h1 className="text-base font-semibold text-ios-text">{getPageTitle()}</h1>

        {page === 'ledgers' && (
          <button onClick={openCreateLedger} className="absolute right-4 text-ios-primary text-sm font-medium active:opacity-60">
            新建
          </button>
        )}

        {page === 'main' && (
          <div className="absolute right-4">
            <CloudSyncButton />
          </div>
        )}
      </div>

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
    </div>
  );
};
