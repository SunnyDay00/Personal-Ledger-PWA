import React, { useEffect, useState } from 'react';
import { Icon } from './ui/Icon';
import { cn } from '../utils';
import { format } from 'date-fns';
import { dbAPI } from '../services/db';
import { useApp } from '../contexts/AppContext';

interface UsageStats {
    id: number;
    d1_rows_read: number;
    d1_rows_written: number;
    d1_queries?: number;
    kv_read_ops: number;
    kv_write_ops: number;
    updated_at: number;
    d1_storage_bytes?: number;
    kv_storage_bytes?: number;
    note?: string;
}

interface UsageStatsModalProps {
    isOpen: boolean;
    onClose: () => void;
    endpoint: string;
    token: string;
    userId: string;
}

export const UsageStatsModal: React.FC<UsageStatsModalProps> = ({ isOpen, onClose, endpoint, token, userId }) => {
    const [mode, setMode] = useState<'local' | 'cloudflare'>('local');
    const [cfConfig, setCfConfig] = useState({ accountId: '', apiToken: '', kvId: '' });
    const [stats, setStats] = useState<UsageStats | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);

    const { state, dispatch, triggerCloudSync } = useApp();

    useEffect(() => {
        if (isOpen) {
            // Load config from state.settings.cfConfig (synced with settings)
            const config = state.settings.cfConfig;
            if (config) {
                setCfConfig({
                    accountId: config.accountId || '',
                    apiToken: config.apiToken || '',
                    kvId: config.kvId || ''
                });
                // If config is missing items, enter edit mode
                if (!config.accountId || !config.apiToken || !config.kvId) {
                    setIsEditing(true);
                }
            } else {
                setIsEditing(true);
            }
        }
    }, [isOpen, state.settings.cfConfig]);

    useEffect(() => {
        // Clear stats when switching modes to avoid showing stale data from previous mode
        setStats(null);
        setError(null);

        if (isOpen && endpoint && token) {
            // If Local mode, fetch immediately
            // If Cloudflare mode, fetch only if not editing and config is present
            if (mode === 'local') {
                fetchStats();
            } else if (mode === 'cloudflare' && !isEditing && cfConfig.accountId) {
                fetchStats();
            }
        }
    }, [isOpen, endpoint, token, mode]);

    const handleSaveConfig = () => {
        // Save cfConfig to settings - this will trigger cloud sync automatically
        dispatch({ type: 'UPDATE_SETTINGS', payload: { cfConfig } });
        console.log('[handleSaveConfig] cfConfig saved to settings, sync will trigger automatically');
        setIsEditing(false);
        fetchStats();
    };

    const fetchStats = async () => {
        if (mode === 'cloudflare' && (!cfConfig.accountId || !cfConfig.apiToken || !cfConfig.kvId)) {
            setIsEditing(true);
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const url = `${endpoint.replace(/\/$/, '')}/usage?user_id=${encodeURIComponent(userId || 'default')}`;
            const headers: Record<string, string> = { 'Authorization': `Bearer ${token}` };

            if (mode === 'cloudflare') {
                headers['X-CF-Account-ID'] = cfConfig.accountId;
                headers['X-CF-API-Token'] = cfConfig.apiToken;
                headers['X-CF-KV-Namespace-ID'] = cfConfig.kvId;
            }

            const res = await fetch(url, { headers });
            if (!res.ok) {
                const errText = await res.text();
                throw new Error(errText || `Failed to fetch stats: ${res.status}`);
            }
            const data = await res.json();
            setStats(data);
        } catch (e: any) {
            setError(e.message || 'Failed to load usage stats');
        } finally {
            setLoading(false);
        }
    };

    const LIMITS = {
        d1_read: 5000000,
        d1_write: 100000,
        kv_read: 10000000,
        kv_write: 100000,
        d1_storage: 5 * 1024 * 1024 * 1024, // 5GB
        kv_storage: 1 * 1024 * 1024 * 1024, // 1GB
    };

    if (!isOpen) return null;

    const isConfigMissing = !cfConfig.accountId || !cfConfig.apiToken || !cfConfig.kvId;
    const showConfigForm = mode === 'cloudflare' && (isEditing || isConfigMissing);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-zinc-900 w-full max-w-sm rounded-2xl shadow-xl border border-ios-border overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-zinc-800">
                    <div>
                        <h3 className="font-semibold text-lg">数据库用量</h3>
                        <p className="text-[10px] text-ios-subtext mt-0.5">
                            统计范围：{format(new Date(), 'yyyy-MM-dd')} (UTC)
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 -mr-2 text-ios-subtext hover:text-ios-text">
                        <Icon name="X" className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-4 space-y-4">
                    {/* Mode Toggle */}
                    <div className="flex p-1 bg-gray-100 dark:bg-zinc-800 rounded-lg">
                        <button
                            onClick={() => setMode('local')}
                            className={cn(
                                "flex-1 py-1.5 text-xs font-medium rounded-md transition-all",
                                mode === 'local' ? "bg-white dark:bg-zinc-700 shadow-sm text-ios-text" : "text-ios-subtext hover:text-ios-text"
                            )}
                        >
                            本地软件统计
                        </button>
                        <button
                            onClick={() => setMode('cloudflare')}
                            className={cn(
                                "flex-1 py-1.5 text-xs font-medium rounded-md transition-all",
                                mode === 'cloudflare' ? "bg-white dark:bg-zinc-700 shadow-sm text-ios-text" : "text-ios-subtext hover:text-ios-text"
                            )}
                        >
                            Cloudflare 官方 API
                        </button>
                    </div>

                    {showConfigForm ? (
                        <div className="space-y-3 animate-in slide-in-from-top-2">
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-ios-subtext ml-1">Account ID</label>
                                <input
                                    type="text"
                                    value={cfConfig.accountId}
                                    onChange={e => setCfConfig({ ...cfConfig, accountId: e.target.value })}
                                    className="w-full bg-gray-50 dark:bg-zinc-800 p-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-ios-primary/20"
                                    placeholder="Cloudflare Account ID"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-ios-subtext ml-1">API Token</label>
                                <input
                                    type="password"
                                    value={cfConfig.apiToken}
                                    onChange={e => setCfConfig({ ...cfConfig, apiToken: e.target.value })}
                                    className="w-full bg-gray-50 dark:bg-zinc-800 p-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-ios-primary/20"
                                    placeholder="Cloudflare API Token"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-ios-subtext ml-1">KV Namespace ID</label>
                                <input
                                    type="text"
                                    value={cfConfig.kvId}
                                    onChange={e => setCfConfig({ ...cfConfig, kvId: e.target.value })}
                                    className="w-full bg-gray-50 dark:bg-zinc-800 p-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-ios-primary/20"
                                    placeholder="KV Namespace ID"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => setIsEditing(false)}
                                    className="w-full py-2.5 bg-gray-100 dark:bg-zinc-800 text-ios-text text-sm font-medium rounded-xl active:opacity-90 transition-opacity"
                                    disabled={loading}
                                >
                                    取消
                                </button>
                                <button
                                    onClick={handleSaveConfig}
                                    className="w-full py-2.5 bg-ios-primary text-white text-sm font-medium rounded-xl active:opacity-90 transition-opacity"
                                >
                                    保存并获取
                                </button>
                            </div>
                            <p className="text-[10px] text-ios-subtext text-center px-2">
                                需要 Cloudflare Account Analytics 和 Workers KV Storage 读取权限。
                            </p>
                        </div>
                    ) : (
                        <>
                            {loading ? (
                                <div className="flex flex-col items-center justify-center py-8 text-ios-subtext gap-2">
                                    <Icon name="Loader2" className="w-6 h-6 animate-spin" />
                                    <span className="text-sm">加载中...</span>
                                    <p className="text-[10px] text-ios-subtext">正在查询 Cloudflare GraphQL API...</p>
                                </div>
                            ) : error ? (
                                <div className="flex flex-col items-center justify-center py-8 text-red-500 gap-2">
                                    <Icon name="AlertCircle" className="w-8 h-8" />
                                    <span className="text-sm text-center px-4">{error}</span>
                                    <button onClick={fetchStats} className="mt-2 text-xs bg-red-100 dark:bg-red-900/30 px-3 py-1.5 rounded-lg">
                                        重试
                                    </button>
                                    {mode === 'cloudflare' && (
                                        <button onClick={() => setIsEditing(true)} className="mt-2 text-xs text-ios-subtext underline">
                                            重新配置 API
                                        </button>
                                    )}
                                </div>
                            ) : stats ? (
                                <div className="space-y-4 animate-in fade-in">
                                    <div className="grid grid-cols-2 gap-3">
                                        <StatCard
                                            label="D1 读取行数"
                                            value={stats.d1_rows_read}
                                            limit={LIMITS.d1_read}
                                            icon="Download"
                                            color="text-blue-500"
                                            bg="bg-blue-50 dark:bg-blue-900/20"
                                        />
                                        <StatCard
                                            label="D1 写入行数"
                                            value={stats.d1_rows_written}
                                            limit={LIMITS.d1_write}
                                            icon="Upload"
                                            color="text-green-500"
                                            bg="bg-green-50 dark:bg-green-900/20"
                                        />
                                        <StatCard
                                            label="KV 读取次数"
                                            value={stats.kv_read_ops}
                                            limit={LIMITS.kv_read}
                                            icon="Search"
                                            color="text-purple-500"
                                            bg="bg-purple-50 dark:bg-purple-900/20"
                                        />
                                        <StatCard
                                            label="KV 写入次数"
                                            value={stats.kv_write_ops}
                                            limit={LIMITS.kv_write}
                                            icon="Edit3"
                                            color="text-orange-500"
                                            bg="bg-orange-50 dark:bg-orange-900/20"
                                        />
                                    </div>

                                    {/* D1 Queries (Extra Info) */}
                                    {stats.d1_queries !== undefined && (
                                        <div className="flex justify-between items-center px-3 py-2 bg-gray-50 dark:bg-zinc-800/50 rounded-xl">
                                            <span className="text-xs text-ios-subtext">D1 总查询数 (Queries)</span>
                                            <span className="text-sm font-mono font-medium">{stats.d1_queries.toLocaleString()}</span>
                                        </div>
                                    )}

                                    <div className="bg-gray-50 dark:bg-zinc-800/50 rounded-xl p-3 space-y-3">
                                        <StorageBar
                                            label="D1 存储占用"
                                            value={stats.d1_storage_bytes || 0}
                                            limit={LIMITS.d1_storage}
                                        />
                                        <StorageBar
                                            label="KV 存储占用"
                                            value={stats.kv_storage_bytes || 0}
                                            limit={LIMITS.kv_storage}
                                        />

                                        <div className="flex justify-between text-xs pt-1 border-t border-gray-200 dark:border-zinc-700/50">
                                            <span className="text-ios-subtext">上次更新</span>
                                            <span className="font-medium text-ios-subtext">
                                                {stats.updated_at ? format(stats.updated_at, 'MM/dd HH:mm') : '-'}
                                            </span>
                                        </div>
                                    </div>

                                    <p className="text-[10px] text-ios-subtext text-center px-4 leading-relaxed">
                                        {stats.note || '注：数据仅供参考，Cloudflare 每日额度按 UTC 时间重置。'}
                                    </p>

                                    {mode === 'cloudflare' && (
                                        <button onClick={() => setIsEditing(true)} className="w-full text-[10px] text-ios-subtext underline text-center">
                                            修改 API 配置
                                        </button>
                                    )}
                                </div>
                            ) : null}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

const StatCard: React.FC<{ label: string; value: number; limit: number; icon: string; color: string; bg: string }> = ({ label, value, limit, icon, color, bg }) => {
    const percent = Math.min((value / limit) * 100, 100);
    const isWarning = percent > 80;

    return (
        <div className="bg-gray-50 dark:bg-zinc-800/50 rounded-xl p-3 flex flex-col gap-2 relative overflow-hidden">
            <div className="flex justify-between items-start z-10">
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", bg, color)}>
                    <Icon name={icon} className="w-4 h-4" />
                </div>
                <div className="text-[10px] font-medium text-ios-subtext bg-white/50 dark:bg-black/20 px-1.5 py-0.5 rounded-full">
                    {percent.toFixed(1)}%
                </div>
            </div>
            <div className="z-10">
                <div className="text-lg font-bold font-mono leading-tight">{value.toLocaleString()}</div>
                <div className="text-[10px] text-ios-subtext mt-0.5">{label}</div>
            </div>

            {/* Progress Bar Background */}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-200 dark:bg-zinc-700">
                <div
                    className={cn("h-full transition-all duration-500", isWarning ? "bg-red-500" : "bg-ios-primary")}
                    style={{ width: `${percent}%` }}
                />
            </div>
        </div>
    );
};

const StorageBar: React.FC<{ label: string; value: number; limit: number }> = ({ label, value, limit }) => {
    const percent = Math.min((value / limit) * 100, 100);
    const formatSize = (bytes: number) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    };

    return (
        <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
                <span className="text-ios-subtext">{label}</span>
                <span className="font-medium font-mono text-ios-text">
                    {formatSize(value)} <span className="text-ios-subtext text-[10px]">/ {formatSize(limit)}</span>
                </span>
            </div>
            <div className="h-1.5 w-full bg-gray-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                <div
                    className={cn("h-full rounded-full transition-all duration-500", percent > 90 ? "bg-red-500" : "bg-blue-500")}
                    style={{ width: `${percent}%` }}
                />
            </div>
        </div>
    );
};
