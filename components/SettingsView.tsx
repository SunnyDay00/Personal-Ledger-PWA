
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { Icon } from './ui/Icon';
import { CloudSyncButton } from './CloudSyncButton';
import { THEME_PRESETS, AVAILABLE_ICONS, DEFAULT_CATEGORIES } from '../constants';
import { UPDATE_LOGS } from '../changelog';
import { generateId, exportToJson, exportToCsv, cn, readCsvFileWithEncoding } from '../utils';
import { WebDAVService } from '../services/webdav';
import { db } from '../services/db';
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
  const { state, dispatch, manualBackup, restoreFromCloud, smartImportCsv, manualCloudSync, resetApp, addLedger } = useApp();
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
    syncDebounceSeconds: state.settings.syncDebounceSeconds ?? 3,
    versionCheckIntervalFg: state.settings.versionCheckIntervalFg ?? 10,
    versionCheckIntervalBg: state.settings.versionCheckIntervalBg ?? 20,
  });
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [reminderDays, setReminderDays] = useState<number>(state.settings.backupReminderDays ?? 7);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState<boolean>(state.settings.backupAutoEnabled ?? false);
  const [autoBackupDays, setAutoBackupDays] = useState<number>(state.settings.backupIntervalDays ?? 7);
  const [exportStart, setExportStart] = useState(state.settings.exportStartDate || '');
  const [exportEnd, setExportEnd] = useState(state.settings.exportEndDate || '');

  const [showSyncLog, setShowSyncLog] = useState(false);
  const [ledgerModal, setLedgerModal] = useState<{ isOpen: boolean; mode: 'create' | 'edit'; id?: string; name: string; color: string }>(
    { isOpen: false, mode: 'create', name: '', color: '#007AFF' }
  );
  const [selectedLedgerId, setSelectedLedgerId] = useState(state.currentLedgerId || state.ledgers[0]?.id || '');
  const [catType, setCatType] = useState<'expense' | 'income'>('expense');
  const [isAddingCat, setIsAddingCat] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('Circle');
  const [isReordering, setIsReordering] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [groupModal, setGroupModal] = useState<{ isOpen: boolean; mode: 'create' | 'edit'; id?: string; name: string; categoryIds: string[] }>({
    isOpen: false,
    mode: 'create',
    name: '',
    categoryIds: [],
  });

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
      syncDebounceSeconds: state.settings.syncDebounceSeconds ?? 3,
      versionCheckIntervalFg: state.settings.versionCheckIntervalFg ?? 10,
      versionCheckIntervalBg: state.settings.versionCheckIntervalBg ?? 20,
    });
    setReminderDays(state.settings.backupReminderDays ?? 7);
    setAutoBackupEnabled(state.settings.backupAutoEnabled ?? false);
    setAutoBackupDays(state.settings.backupIntervalDays ?? 7);
    setExportStart(state.settings.exportStartDate || '');
    setExportEnd(state.settings.exportEndDate || '');
  }, [state.settings, isWebDavEditing]);

  const sortedCategories = useMemo(() => {
    return state.categories
      .filter(c => !c.isDeleted && c.ledgerId === selectedLedgerId)
      .sort((a, b) => a.order - b.order);
  }, [state.categories, selectedLedgerId]);

  const sortedGroups = useMemo(() => {
    return (state.categoryGroups || [])
      .filter(g => !g.isDeleted && g.ledgerId === selectedLedgerId)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [state.categoryGroups, selectedLedgerId]);

  // 如果本地 DB 已有分组但 state 为空，尝试从 DB 刷新到 state（避免界面不显示）
  useEffect(() => {
    if (sortedGroups.length > 0) return;
    db.categoryGroups.orderBy('order').toArray().then(groups => {
      if (groups && groups.length > 0) {
        dispatch({ type: 'RESTORE_DATA', payload: { categoryGroups: groups } });
      }
    }).catch(() => { });
  }, [sortedGroups.length, dispatch]);
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
        syncDebounceSeconds: Math.max(1, Number(d1Form.syncDebounceSeconds) || 3),
        versionCheckIntervalFg: Math.max(2, Number(d1Form.versionCheckIntervalFg) || 10),
        versionCheckIntervalBg: Math.max(2, Number(d1Form.versionCheckIntervalBg) || 20),
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

  const saveLedger = async () => {
    if (!ledgerModal.name.trim()) {
      window.alert('请输入账本名称');
      return;
    }

    if (ledgerModal.mode === 'edit' && ledgerModal.id) {
      // Edit
      const original = state.ledgers.find(l => l.id === ledgerModal.id);
      if (original) {
        const updated: Ledger = {
          ...original,
          name: ledgerModal.name,
          themeColor: ledgerModal.color,
          updatedAt: Date.now()
        };
        dispatch({ type: 'UPDATE_LEDGER', payload: updated });
        await db.ledgers.put(updated);
        // logOperation is not imported or available in this scope, removing it to avoid error
        // If needed, we can add it back if we import it or use a different logging mechanism
      }
    } else {
      // Add
      const newLedger: Ledger = {
        id: generateId(),
        name: ledgerModal.name,
        themeColor: ledgerModal.color,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isDeleted: false
      };
      // Use context method to ensure default categories are seeded
      await addLedger(newLedger);
    }
    setLedgerModal({ isOpen: false, mode: 'create', id: undefined, name: '', color: '#007AFF' });
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
    const startMs = exportStart ? new Date(exportStart).setHours(0, 0, 0, 0) : Number.NEGATIVE_INFINITY;
    const endMs = exportEnd ? new Date(exportEnd).setHours(23, 59, 59, 999) : Number.POSITIVE_INFINITY;
    const targetTxs = state.transactions.filter((t) => targetIds.includes(t.ledgerId) && t.date >= startMs && t.date <= endMs);
    if (targetTxs.length === 0) {
      window.alert('暂无可导出的记录');
      return;
    }
    const filename = l ? `${l.name}_${format(new Date(), 'yyyyMMdd_HHmm')}.csv` : `export_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`;
    exportToCsv(targetTxs, state.categories, state.ledgers, filename);
    dispatch({ type: 'UPDATE_SETTINGS', payload: { exportStartDate: exportStart, exportEndDate: exportEnd } });
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
        ledgerId: selectedLedgerId,
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

  const openCreateGroup = () => setGroupModal({ isOpen: true, mode: 'create', name: '', categoryIds: [] });
  const openEditGroup = (g: any) => setGroupModal({ isOpen: true, mode: 'edit', id: g.id, name: g.name, categoryIds: g.categoryIds || [] });
  const handleSaveGroup = () => {
    if (!groupModal.name.trim()) {
      window.alert('请输入分组名称');
      return;
    }
    if (groupModal.mode === 'create') {
      dispatch({
        type: 'ADD_CATEGORY_GROUP',
        payload: {
          id: generateId(),
          ledgerId: selectedLedgerId,
          name: groupModal.name.trim(),
          categoryIds: groupModal.categoryIds,
          order: sortedGroups.length,
          updatedAt: Date.now(),
          isDeleted: false,
        },
      });
    } else if (groupModal.mode === 'edit' && groupModal.id) {
      const original = sortedGroups.find(g => g.id === groupModal.id);
      if (original) {
        dispatch({
          type: 'UPDATE_CATEGORY_GROUP',
          payload: { ...original, name: groupModal.name.trim(), categoryIds: groupModal.categoryIds, updatedAt: Date.now() },
        });
      }
    }
    setGroupModal({ isOpen: false, mode: 'create', name: '', categoryIds: [] });
  };
  const handleDeleteGroup = (id: string) => {
    if (!window.confirm('确定删除该分类组吗？')) return;
    dispatch({ type: 'DELETE_CATEGORY_GROUP', payload: id });
  };
  const moveGroup = (index: number, direction: 'up' | 'down') => {
    const list = [...sortedGroups];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= list.length) return;
    [list[index], list[swapIndex]] = [list[swapIndex], list[index]];
    const normalized = list.map((g, i) => ({ ...g, order: i, updatedAt: Date.now() }));
    dispatch({ type: 'REORDER_CATEGORY_GROUPS', payload: normalized });
  };
  const toggleCategoryInGroup = (catId: string) => {
    setGroupModal(prev => {
      const exists = prev.categoryIds.includes(catId);
      return { ...prev, categoryIds: exists ? prev.categoryIds.filter(id => id !== catId) : [...prev.categoryIds, catId] };
    });
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
        <SettingsItem icon="Info" label="关于" onClick={() => setPage('about')} isLast />
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-ios-subtext ml-1 mb-1 block">自动同步延时（秒）</label>
              <input
                type="number"
                min={1}
                className="w-full bg-gray-100 dark:bg-zinc-800 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-ios-primary/20"
                value={d1Form.syncDebounceSeconds}
                onChange={(e) => setD1Form({ ...d1Form, syncDebounceSeconds: Number(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ios-subtext ml-1 mb-1 block">前台版本探测（秒）</label>
              <input
                type="number"
                min={2}
                className="w-full bg-gray-100 dark:bg-zinc-800 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-ios-primary/20"
                value={d1Form.versionCheckIntervalFg}
                onChange={(e) => setD1Form({ ...d1Form, versionCheckIntervalFg: Number(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ios-subtext ml-1 mb-1 block">后台版本探测（秒）</label>
              <input
                type="number"
                min={2}
                className="w-full bg-gray-100 dark:bg-zinc-800 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-ios-primary/20"
                value={d1Form.versionCheckIntervalBg}
                onChange={(e) => setD1Form({ ...d1Form, versionCheckIntervalBg: Number(e.target.value) || 0 })}
              />
            </div>
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
      <div className="bg-white dark:bg-zinc-900 rounded-2xl mx-4 shadow-sm border border-ios-border p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-ios-subtext ml-1 mb-1 block">导出开始日期（可选）</label>
            <input
              type="date"
              className="w-full bg-gray-100 dark:bg-zinc-800 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-ios-primary/20"
              value={exportStart}
              onChange={(e) => setExportStart(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-ios-subtext ml-1 mb-1 block">导出结束日期（可选）</label>
            <input
              type="date"
              className="w-full bg-gray-100 dark:bg-zinc-800 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-ios-primary/20"
              value={exportEnd}
              onChange={(e) => setExportEnd(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              setExportStart('');
              setExportEnd('');
              dispatch({ type: 'UPDATE_SETTINGS', payload: { exportStartDate: '', exportEndDate: '' } });
            }}
            className="px-4 py-2 rounded-xl text-sm bg-gray-100 dark:bg-zinc-800 text-ios-subtext"
          >
            清空筛选
          </button>
        </div>
      </div>
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


  const handleInitDefaults = async () => {
    if (!window.confirm('确定要为当前账本初始化默认分类吗？')) return;

    let order = 0;
    const timestamp = Date.now();

    // Use the unified rich list from constants
    DEFAULT_CATEGORIES.forEach((cat, idx) => {
      // Ensure ID is unique by appending index and timestamp
      const catId = `${generateId()}_${timestamp}_${idx}`;
      dispatch({
        type: 'ADD_CATEGORY',
        payload: {
          id: catId,
          ledgerId: selectedLedgerId,
          name: cat.name,
          icon: cat.icon,
          type: cat.type,
          order: order++,
          isCustom: false,
          updatedAt: Date.now()
        }
      });
    });

    // Force sync to ensure cloud is updated immediately
    await manualCloudSync();
    window.alert('初始化完成并已触发同步');
  };

  const handleCleanDuplicates = async () => {
    if (!window.confirm('确定要清理当前账本的重复分类（含未归类）吗？这将合并同名分类并更新相关账单。')) return;

    // Include orphans in the cleanup scope
    const currentCats = state.categories.filter(c => (c.ledgerId === selectedLedgerId || !c.ledgerId) && !c.isDeleted);
    const groups: Record<string, typeof currentCats> = {};

    // Group by type:name
    currentCats.forEach(c => {
      const key = `${c.type}:${c.name.trim()}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    });

    let removedCount = 0;
    let txUpdatedCount = 0;

    for (const key in groups) {
      const list = groups[key];
      if (list.length < 2) continue;

      // Sort: prefer item with correct ledgerId, then latest update
      list.sort((a, b) => {
        const aValid = a.ledgerId === selectedLedgerId ? 1 : 0;
        const bValid = b.ledgerId === selectedLedgerId ? 1 : 0;
        if (aValid !== bValid) return bValid - aValid; // Valid one comes first
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      });

      const master = list[0];
      const dups = list.slice(1);

      // If master is an orphan, claim it
      if (master.ledgerId !== selectedLedgerId) {
        dispatch({ type: 'UPDATE_CATEGORY', payload: { ...master, ledgerId: selectedLedgerId, updatedAt: Date.now() } });
      }

      for (const dup of dups) {
        const txs = state.transactions.filter(t => t.categoryId === dup.id);
        if (txs.length > 0) {
          // Update transactions
          const ids = txs.map(t => t.id);
          dispatch({
            type: 'BATCH_UPDATE_TRANSACTIONS',
            payload: { ids, updates: { categoryId: master.id } }
          });
          txUpdatedCount += txs.length;
        }

        // Delete dup
        dispatch({ type: 'DELETE_CATEGORY', payload: dup.id });
        removedCount++;
      }
    }

    window.alert(`清理完成：合并了 ${removedCount} 个重复分类，更新了 ${txUpdatedCount} 条账单。`);
  };

  const handleDeleteAllGroups = () => {
    if (!window.confirm('确定要删除当前账本的所有分类组吗？此操作不可恢复。')) return;
    const groups = state.categoryGroups.filter(g => g.ledgerId === selectedLedgerId && !g.isDeleted);
    groups.forEach(g => {
      dispatch({ type: 'DELETE_CATEGORY_GROUP', payload: g.id });
    });
    window.alert(`已删除 ${groups.length} 个分类组`);
  };

  const renderCategories = () => (
    <>
      <div className="h-4"></div>

      {/* Ledger Switcher for Categories */}
      <div className="mx-4 mb-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
          {state.ledgers.map(l => (
            <button
              key={l.id}
              onClick={() => setSelectedLedgerId(l.id)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap border",
                selectedLedgerId === l.id
                  ? "bg-ios-primary text-white border-ios-primary"
                  : "bg-white dark:bg-zinc-900 text-ios-text border-gray-200 dark:border-zinc-700"
              )}
            >
              <div className="w-2 h-2 rounded-full bg-white" style={{ backgroundColor: selectedLedgerId === l.id ? 'white' : l.themeColor }}></div>
              {l.name}
            </button>
          ))}
        </div>
      </div>

      {state.categories.filter(c => c.ledgerId === selectedLedgerId).length === 0 && (
        <div className="mx-4 mb-4">
          <button onClick={handleInitDefaults} className="w-full py-3 bg-ios-primary/10 text-ios-primary rounded-xl text-sm font-medium border border-ios-primary/20 active:bg-ios-primary/20 transition-colors">
            初始化默认分类
          </button>
        </div>
      )}

      {/* Delete All Groups Button - Only show if groups exist */}
      {sortedGroups.length > 0 && (
        <div className="mx-4 mb-4">
          <button onClick={handleDeleteAllGroups} className="w-full py-3 bg-red-500/10 text-red-600 rounded-xl text-sm font-medium border border-red-500/20 active:bg-red-500/20 transition-colors">
            删除所有分类组
          </button>
        </div>
      )}

      {/* Clean Duplicates Button - Only show if duplicates exist */}
      {(() => {
        const cats = state.categories.filter(c => c.ledgerId === selectedLedgerId && !c.isDeleted);
        const names = new Set();
        let hasDup = false;
        for (const c of cats) {
          const key = `${c.type}:${c.name.trim()}`;
          if (names.has(key)) { hasDup = true; break; }
          names.add(key);
        }
        return hasDup;
      })() && (
          <div className="mx-4 mb-4">
            <button onClick={handleCleanDuplicates} className="w-full py-3 bg-orange-500/10 text-orange-600 rounded-xl text-sm font-medium border border-orange-500/20 active:bg-orange-500/20 transition-colors">
              检测到重复分类 - 点击清理
            </button>
          </div>
        )}

      <div className="mx-4 mb-4 bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-ios-border p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold">分类组</h3>
            <p className="text-xs text-ios-subtext">自定义分组，在统计中按分组查看汇总。</p>
          </div>
          <button onClick={openCreateGroup} className="px-3 py-1.5 rounded-xl bg-ios-primary text-white text-xs font-medium">新建分组</button>
        </div>
        {sortedGroups.length === 0 && <p className="text-xs text-ios-subtext">暂无分组</p>}
        <div className="space-y-2">
          {sortedGroups.map((g, idx) => {
            const count = (g.categoryIds || []).length;
            return (
              <div key={g.id} className="flex items-center justify-between bg-gray-50 dark:bg-zinc-800 rounded-xl px-3 py-2">
                <div>
                  <div className="text-sm font-medium">{g.name}</div>
                  <div className="text-[11px] text-ios-subtext">{count} 个分类</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => moveGroup(idx, 'up')} disabled={idx === 0} className="p-1 text-ios-subtext disabled:opacity-30"><Icon name="ChevronUp" className="w-4 h-4" /></button>
                  <button onClick={() => moveGroup(idx, 'down')} disabled={idx === sortedGroups.length - 1} className="p-1 text-ios-subtext disabled:opacity-30"><Icon name="ChevronDown" className="w-4 h-4" /></button>
                  <button onClick={() => openEditGroup(g)} className="p-1 text-ios-primary"><Icon name="Edit2" className="w-4 h-4" /></button>
                  <button onClick={() => handleDeleteGroup(g.id)} className="p-1 text-red-500"><Icon name="Trash2" className="w-4 h-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

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

      {groupModal.isOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 rounded-t-3xl p-6 animate-slide-up h-[70vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <button onClick={() => setGroupModal({ isOpen: false, mode: 'create', name: '', categoryIds: [] })} className="text-ios-subtext">取消</button>
              <h3 className="font-bold text-lg">{groupModal.mode === 'create' ? '新建分类组' : '编辑分类组'}</h3>
              <button onClick={handleSaveGroup} className="text-ios-primary font-bold">保存</button>
            </div>

            <div className="space-y-4 flex-1 overflow-y-auto no-scrollbar">
              <div>
                <label className="text-xs text-ios-subtext ml-1 mb-1 block">分组名称</label>
                <input
                  type="text"
                  className="w-full bg-gray-100 dark:bg-zinc-800 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-ios-primary/20"
                  value={groupModal.name}
                  onChange={(e) => setGroupModal(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="如：吃喝、交通"
                />
              </div>
              <div>
                <div className="text-xs text-ios-subtext mb-2">选择包含的分类</div>
                <div className="grid grid-cols-2 gap-2 max-h-80 overflow-y-auto no-scrollbar">
                  {state.categories.filter(c => !c.isDeleted).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(cat => {
                    const checked = groupModal.categoryIds.includes(cat.id);
                    return (
                      <label key={cat.id} className={cn("flex items-center gap-2 p-2 rounded-xl border", checked ? "border-ios-primary bg-ios-primary/5" : "border-gray-200 dark:border-zinc-800")}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCategoryInGroup(cat.id)}
                        />
                        <span className="text-sm">{cat.name}</span>
                        <span className="text-[10px] text-ios-subtext">{cat.type === 'expense' ? '支出' : '收入'}</span>
                      </label>
                    );
                  })}
                </div>
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
        {state.operationLogs.map((log) => {
          const map: Record<string, { label: string; icon: string; color: string }> = {
            add: { label: '新增', icon: 'Plus', color: 'text-green-500' },
            edit: { label: '编辑', icon: 'Edit3', color: 'text-blue-500' },
            delete: { label: '删除', icon: 'Trash2', color: 'text-red-500' },
            restore: { label: '撤回', icon: 'RotateCcw', color: 'text-amber-500' },
            import: { label: '导入', icon: 'Download', color: 'text-purple-500' },
            export: { label: '导出', icon: 'Upload', color: 'text-emerald-500' },
          };
          const meta = map[log.type] || { label: log.type, icon: 'Info', color: 'text-ios-subtext' };
          return (
            <div key={log.id} className="p-4 border-b border-gray-100 dark:border-zinc-800 last:border-0 flex items-start gap-3">
              <div className={`w-8 h-8 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center ${meta.color}`}>
                <Icon name={meta.icon} className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{meta.label}</span>
                  <span className="text-[10px] text-ios-subtext">{format(log.timestamp, 'yyyy/MM/dd HH:mm')}</span>
                </div>
                <p className="text-xs text-ios-subtext">{log.details || log.targetId}</p>
              </div>
            </div>
          );
        })}
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
