import React, { useEffect, useState } from 'react';
import { Icon } from './ui/Icon';
import {
  aiStorage,
  DEEPSEEK_BASE_URL,
  DEEPSEEK_MODELS,
  DEFAULT_DEEPSEEK_MODEL,
  getDeepSeekModelName,
} from '../services/aiStorage';
import { deepSeekAdapter } from '../services/deepseek';
import { feedback } from '../services/feedback';
import { useApp } from '../contexts/AppContext';
import { AiModel } from '../types';

const DEEPSEEK_LOGO_SRC = `${import.meta.env.BASE_URL}deepseek-logo.png`;

const GuideSection: React.FC<{
  icon: string;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ icon, title, defaultOpen = false, children }) => (
  <details className="group border-t border-ios-border first:border-t-0" open={defaultOpen || undefined}>
    <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3.5 text-sm font-semibold text-ios-text active:bg-black/[0.03] dark:active:bg-white/[0.04] [&::-webkit-details-marker]:hidden">
      <Icon name={icon} className="h-4 w-4 shrink-0 text-ios-primary" />
      <span className="flex-1">{title}</span>
      <Icon name="ChevronDown" className="h-4 w-4 text-ios-subtext transition-transform group-open:rotate-180" />
    </summary>
    <div className="border-t border-ios-border bg-gray-50/70 px-4 py-3.5 text-xs leading-5 text-ios-subtext dark:bg-zinc-950/35">
      {children}
    </div>
  </details>
);

export const AISettingsView: React.FC = () => {
  const { state, dispatch } = useApp();
  const [apiKey, setApiKey] = useState('');
  const [savedKey, setSavedKey] = useState('');
  const [model, setModel] = useState<AiModel>(DEFAULT_DEEPSEEK_MODEL);
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [selectingModel, setSelectingModel] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    const loadConfig = state.settings.aiConfig
      ? Promise.resolve(state.settings.aiConfig)
      : aiStorage.getConfig();
    loadConfig.then(config => {
      if (!active) return;
      setApiKey(config.apiKey);
      setSavedKey(config.apiKey);
      setModel(config.model);
      setLoading(false);
    }).catch(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const save = async () => {
    const normalized = apiKey.trim();
    if (!normalized) {
      setMessage({ tone: 'error', text: '请输入 DeepSeek API Key' });
      return;
    }
    const current = await aiStorage.getConfig();
    let consentAt = current.dataConsentAt;
    if (!consentAt) {
      const accepted = window.confirm(
        '使用 AI 查询时，你的问题以及完成查询所需的分类元数据、聚合结果或匹配明细会发送给 DeepSeek。完整数据库和图片附件不会上传。是否同意并保存？'
      );
      if (!accepted) return;
      consentAt = Date.now();
    }
    const nextConfig = await aiStorage.saveConfig({ apiKey: normalized, model, dataConsentAt: consentAt });
    dispatch({ type: 'UPDATE_SETTINGS', payload: { aiConfig: nextConfig } });
    setApiKey(normalized);
    setSavedKey(normalized);
    setMessage({ tone: 'success', text: 'API Key 已保存，将随账号设置和 WebDAV 备份同步' });
    feedback.play('success');
    feedback.vibrate('light');
  };

  const selectModel = async (nextModel: AiModel) => {
    if (nextModel === model || selectingModel) return;
    setSelectingModel(true);
    setMessage(null);
    try {
      const nextConfig = await aiStorage.saveConfig({ model: nextModel });
      dispatch({ type: 'UPDATE_SETTINGS', payload: { aiConfig: nextConfig } });
      setModel(nextConfig.model);
      setMessage({ tone: 'success', text: `已切换到 ${getDeepSeekModelName(nextConfig.model)}` });
      feedback.play('click');
      feedback.vibrate('light');
    } catch {
      setMessage({ tone: 'error', text: '模型切换失败，请重试' });
    } finally {
      setSelectingModel(false);
    }
  };

  const test = async () => {
    const normalized = apiKey.trim();
    if (!normalized) {
      setMessage({ tone: 'error', text: '请先填写 API Key' });
      return;
    }
    setTesting(true);
    setMessage(null);
    try {
      await deepSeekAdapter.testConnection(normalized, model);
      setMessage({ tone: 'success', text: `连接成功，${getDeepSeekModelName(model)} 可用` });
      feedback.play('success');
      feedback.vibrate('light');
    } catch (error: any) {
      setMessage({ tone: 'error', text: error?.message || '连接失败' });
    } finally {
      setTesting(false);
    }
  };

  const remove = async () => {
    if (!savedKey) return;
    if (!window.confirm('确定删除 DeepSeek API Key 吗？删除会同步到账户设置和后续 WebDAV 备份，对话记录会保留。')) return;
    const nextConfig = await aiStorage.deleteApiKey();
    dispatch({ type: 'UPDATE_SETTINGS', payload: { aiConfig: nextConfig } });
    setApiKey('');
    setSavedKey('');
    setMessage({ tone: 'success', text: 'API Key 已删除' });
    feedback.play('delete');
    feedback.vibrate('medium');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-ios-subtext">
        <Icon name="Loader2" className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-4 pb-8">
      <div className="mb-5 rounded-2xl border border-ios-border bg-white p-4 shadow-sm dark:bg-zinc-900">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-100">
            <img src={DEEPSEEK_LOGO_SRC} alt="DeepSeek" className="h-9 w-9 object-contain" />
          </div>
          <div>
            <div className="text-sm font-semibold text-ios-text">DeepSeek</div>
            <div className="text-xs text-ios-subtext">当前可用服务商</div>
          </div>
          <Icon name="CheckCircle2" className="ml-auto h-5 w-5 text-ios-success" />
        </div>
      </div>

      <div className="mb-5 overflow-hidden rounded-2xl border border-ios-border bg-white shadow-sm dark:bg-zinc-900">
        <div className="border-b border-ios-border p-4">
          <div className="mb-1 text-xs text-ios-subtext">API 地址</div>
          <div className="break-all text-sm font-medium text-ios-text">{DEEPSEEK_BASE_URL}</div>
        </div>
        <div className="p-4">
          <div className="mb-2 text-xs text-ios-subtext">选择模型</div>
          <div className="grid gap-2">
            {DEEPSEEK_MODELS.map(option => {
              const selected = model === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => void selectModel(option.id)}
                  disabled={selectingModel}
                  aria-pressed={selected}
                  className={`flex items-center rounded-xl border px-3 py-3 text-left transition-colors active:scale-[0.99] disabled:opacity-60 ${
                    selected
                      ? 'border-ios-primary bg-ios-primary/10'
                      : 'border-ios-border bg-gray-50 dark:bg-zinc-800/70'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-semibold ${selected ? 'text-ios-primary' : 'text-ios-text'}`}>
                      {option.name}
                    </div>
                    <div className="mt-0.5 text-[11px] text-ios-subtext">{option.id}</div>
                    <div className="mt-1 text-xs text-ios-subtext">{option.description}</div>
                  </div>
                  <Icon
                    name={selected ? 'CheckCircle2' : 'Circle'}
                    className={`ml-3 h-5 w-5 shrink-0 ${selected ? 'text-ios-primary' : 'text-ios-border'}`}
                  />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mb-3">
        <label className="mb-2 block px-1 text-xs font-semibold text-ios-subtext">API Key</label>
        <div className="flex items-center rounded-2xl border border-ios-border bg-white px-4 shadow-sm focus-within:border-ios-primary dark:bg-zinc-900">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={event => {
              setApiKey(event.target.value);
              setMessage(null);
            }}
            placeholder="sk-..."
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent py-3.5 text-sm text-ios-text outline-none"
          />
          <button
            type="button"
            onClick={() => setShowKey(value => !value)}
            className="ml-2 p-2 text-ios-subtext active:opacity-60"
            aria-label={showKey ? '隐藏 API Key' : '显示 API Key'}
          >
            <Icon name={showKey ? 'EyeOff' : 'Eye'} className="h-4 w-4" />
          </button>
        </div>
      </div>

      {message && (
        <div className={`mb-3 rounded-xl px-3 py-2 text-xs ${
          message.tone === 'success'
            ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300'
            : 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-300'
        }`}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={test}
          disabled={testing || !apiKey.trim()}
          className="flex items-center justify-center gap-2 rounded-xl bg-gray-100 py-3 text-sm font-semibold text-ios-text active:scale-[0.98] disabled:opacity-40 dark:bg-zinc-800"
        >
          <Icon name={testing ? 'Loader2' : 'Wifi'} className={`h-4 w-4 ${testing ? 'animate-spin' : ''}`} />
          测试连接
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!apiKey.trim() || apiKey.trim() === savedKey}
          className="rounded-xl bg-ios-primary py-3 text-sm font-semibold text-white active:scale-[0.98] disabled:opacity-40"
        >
          保存
        </button>
      </div>

      {savedKey && (
        <button
          type="button"
          onClick={remove}
          className="mt-3 w-full rounded-xl bg-red-50 py-3 text-sm font-semibold text-red-500 active:scale-[0.98] dark:bg-red-950/30"
        >
          删除 API Key
        </button>
      )}

      <div className="mt-5 rounded-2xl bg-ios-primary/5 p-4 text-xs leading-5 text-ios-subtext">
        <div className="mb-1 flex items-center gap-1.5 font-semibold text-ios-text">
          <Icon name="ShieldCheck" className="h-4 w-4 text-ios-primary" />
          保存、同步与数据边界
        </div>
        API Key 保存在本机 IndexedDB，并会进入账号同步的 D1 设置数据、WebDAV 的 settings.json 和整库 JSON 导出。对话、消息及上下文摘要仍只保存在本机。上述备份不提供额外的 Key 加密，请妥善保护账号、WebDAV 和导出文件。
      </div>

      <div className="mt-5">
        <div className="mb-2 px-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-ios-text">
            <Icon name="BookOpen" className="h-4 w-4 text-ios-primary" />
            AI 实现原理与使用说明
          </div>
          <div className="mt-1 text-xs leading-5 text-ios-subtext">
            了解 AI 如何查询、发送哪些数据，以及回答结果应如何核对。
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-ios-border bg-white shadow-sm dark:bg-zinc-900">
          <GuideSection icon="Cpu" title="AI 如何查询账本" defaultOpen>
            <ol className="list-decimal space-y-1.5 pl-4">
              <li>DeepSeek 接收问题和固定的只读工具定义，负责把自然语言转换成结构化查询意图。</li>
              <li>模型不会直接连接 IndexedDB，也不能执行 SQL 或任意 JavaScript。</li>
              <li>工具参数会在本机再次校验，再由 TypeScript 查询引擎读取当前账本数据并完成筛选、排序和聚合。</li>
              <li>前端只把回答所需的聚合结果或有限明细返回 DeepSeek，由模型组织最终文字；文字展示前还会经过本地证据校验。</li>
              <li>系统提示词要求数据事实只能来自工具，同时允许模型基于本地结果自然比较、计算占比和解释趋势；本地只拦截“无查询却报数据、聚合冒充明细、零结果说成有记录”等明确冲突。</li>
            </ol>
          </GuideSection>

          <GuideSection icon="List" title="4 个本地只读工具">
            <div className="space-y-2.5">
              <div className="rounded-xl border border-ios-border bg-white p-3 dark:bg-zinc-900">
                <div className="font-mono text-[11px] font-semibold text-ios-primary">get_ledger_catalog</div>
                <div className="mt-1">读取账本、账本类型、显示币种、分类和分类组目录，帮助模型确定可查询范围和消除名称歧义。</div>
              </div>
              <div className="rounded-xl border border-ios-border bg-white p-3 dark:bg-zinc-900">
                <div className="font-mono text-[11px] font-semibold text-ios-primary">find_transactions</div>
                <div className="mt-1">按账本、日期、收支类型、分类、分类组、备注关键字和金额范围查找明细，并支持金额或日期排序；最多返回 50 条。</div>
              </div>
              <div className="rounded-xl border border-ios-border bg-white p-3 dark:bg-zinc-900">
                <div className="font-mono text-[11px] font-semibold text-ios-primary">aggregate_transactions</div>
                <div className="mt-1">本地计算合计、数量、平均、最大、最小和收支差额，并可按时间、账本、类型、分类或分类组聚合。</div>
              </div>
              <div className="rounded-xl border border-ios-border bg-white p-3 dark:bg-zinc-900">
                <div className="font-mono text-[11px] font-semibold text-ios-primary">get_trading_summary</div>
                <div className="mt-1">针对买卖本计算买入、卖出、成本、已实现利润及库存摘要，复用应用现有的买卖本计算口径。</div>
              </div>
            </div>
          </GuideSection>

          <GuideSection icon="Database" title="支持范围与只读边界">
            <div className="space-y-2">
              <p>普通交流、能力询问或对回答的反馈会直接交给 DeepSeek 自然回应，不会为了聊天强制查询账本；涉及数据的问题及“收入呢”“为什么这么高”等数据追问才会启用本地工具。</p>
              <p>支持交易明细、金额、收入/支出、日期、账本、分类、分类组、备注关键字、趋势聚合，以及买卖本的成本、利润和库存摘要。</p>
              <p>AI 没有新增、修改、删除、导入、同步或备份账目的工具，也不会读取图片附件。目前未提供预算分析、附件识别等专用工具。</p>
              <p>问题不在工具范围内时，AI 应说明暂不支持或要求补充条件，而不是绕过本地工具读取其他数据。</p>
            </div>
          </GuideSection>

          <GuideSection icon="Clock" title="上下文、压缩与调用限制">
            <ul className="list-disc space-y-1.5 pl-4">
              <li>每次请求最多携带最近 24 条完整消息，通常约 12 轮问答，正文总量约 40,000 字符。</li>
              <li>超过窗口的旧消息会压缩为最多 2,000 字符的摘要；旧金额只作为历史结论，历史助手文字不作为财务证据，相关问题仍需重新查询。</li>
              <li>单个问题最多进行 5 轮工具往返、累计 8 次工具调用；单个工具结果最多 50,000 字符。</li>
              <li>摘要生成会使用所选 DeepSeek 模型并产生 API token；摘要失败不影响当前回答，会降级为最近消息窗口。</li>
            </ul>
          </GuideSection>

          <GuideSection icon="BarChart3" title="统计口径">
            <ul className="list-disc space-y-1.5 pl-4">
              <li>新对话默认查询创建时的当前账本，只有明确说“全部账本”或指定账本才扩大范围。</li>
              <li>“最近15天”包含今天；近半年和近一年按设备本地时区及自然月计算。</li>
              <li>账本金额以交易的 CNY 基准金额计算，再按账本显示币种呈现；跨账本总计只有明确标注时才折合人民币。</li>
              <li>普通记账本与买卖本分开统计，不会把买卖记录强行混成普通收支差额。</li>
            </ul>
          </GuideSection>

          <GuideSection icon="ShieldCheck" title="数据发送、保存与同步">
            <ul className="list-disc space-y-1.5 pl-4">
              <li>问题、必要的分类元数据、聚合结果或匹配明细会直接发送到 DeepSeek；完整数据库和图片附件不会上传。</li>
              <li>备注只在明细查询或备注搜索确有需要时发送，账本中的文字不能覆盖系统安全规则。</li>
              <li>API Key 保存在 IndexedDB，并进入账号 D1 设置同步、WebDAV settings.json 和整库 JSON 导出。</li>
              <li>对话、消息、摘要和查询轨迹只保存在本机，不进入账号同步、WebDAV 或 JSON 导出。</li>
            </ul>
          </GuideSection>

          <GuideSection icon="AlertCircle" title="使用注意事项">
            <ul className="list-disc space-y-1.5 pl-4">
              <li>金额和统计由本地工具确定性计算，系统提示词约束模型只能以本轮结果作为数据事实；本地校验只兜底拦截明确冲突，不会因正常的占比、比较或自然表达强制改成固定模板。</li>
              <li>模型仍可能误解问题或选错查询范围，请展开“查询依据”核对账本、日期、条件和记录数。</li>
              <li>聚合工具不能证明单笔交易的日期、分类或备注；展示明细前必须额外执行 find_transactions，明细为 0 时只能回答“未找到”。</li>
              <li>分类重名、范围不清或问题过于宽泛时，应补充账本、时间和类型，避免模型猜测。</li>
              <li>切换 Flash/Pro 只影响问题理解和答案组织，不改变本地统计算法与只读权限。</li>
              <li>本机存储、D1、WebDAV 和导出文件不等同于系统钥匙串，请保护设备、账号、云盘权限及备份文件。</li>
            </ul>
          </GuideSection>
        </div>
      </div>
    </div>
  );
};
