import { AiModel } from '../types';
import { deepSeekAdapter } from './deepseek';

export const DEFAULT_STARTER_QUESTIONS = [
  '近一年最高一次消费是什么？',
  '分析近半年的支出情况',
  '统计最近15天的分类消费',
  '汇总全部账本的收支记录',
] as const;

const STARTER_QUESTION_POOL = [
  '这个月哪一类花得最多？',
  '比较最近三个月的支出变化',
  '找出今年金额最高的五笔支出',
  '今年哪个月的收入最高？',
  '最近30天有多少笔大额消费？',
  '按分类组分析近半年的支出',
  '比较今年每个月的收入和支出',
  '本月平均每天花了多少钱？',
  '最近一周的消费主要集中在哪些分类？',
  '近一年的收支差额趋势如何？',
  '分别汇总每个账本今年的支出',
  '查找最近备注中提到餐饮的记录',
  '最近半个月支出最低的是哪一天？',
  '统计今年每个季度的消费金额',
  '最近半年一共有多少笔收入？',
  '全部记录中最常用的消费分类是什么？',
] as const;

const QUERY_INTENT_PATTERN = /支出|消费|花费|花了|收入|收支|分类|账本|金额|交易|记录|趋势|平均|最高|最低|合计|汇总|利润|成本|备注|笔数|买入|卖出|库存/;
const WRITE_INTENT_PATTERN = /新增|添加|修改|删除|记一笔|创建预算|导入|同步/;

const normalizeQuestion = (value: string) => value
  .toLocaleLowerCase('zh-CN')
  .replace(/[^\p{L}\p{N}]+/gu, '');

const cleanQuestion = (value: string) => {
  const cleaned = value
    .replace(/```(?:json)?|```/gi, '')
    .replace(/^\s*(?:[-*•]|\d+[.)、．])\s*/, '')
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .trim();
  if (!cleaned) return '';
  return /[？?]$/.test(cleaned) ? cleaned.replace(/\?$/, '？') : `${cleaned}？`;
};

const isSuitableQuestion = (question: string) => (
  question.length >= 6
  && question.length <= 42
  && QUERY_INTENT_PATTERN.test(question)
  && !WRITE_INTENT_PATTERN.test(question)
);

export const parseStarterQuestions = (raw: string) => {
  let candidates: string[] = [];
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  if (/^\s*\[/.test(trimmed)) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) candidates = parsed.map(String);
    } catch {
      candidates = [];
    }
  }
  if (candidates.length === 0) {
    candidates = trimmed.split(/\r?\n/);
  }

  const seen = new Set<string>();
  return candidates
    .map(cleanQuestion)
    .filter(question => {
      const normalized = normalizeQuestion(question);
      if (!normalized || seen.has(normalized) || !isSuitableQuestion(question)) return false;
      seen.add(normalized);
      return true;
    });
};

export const pickLocalStarterQuestions = (
  previous: readonly string[] = [],
  count = 4,
  random: () => number = Math.random
) => {
  const excluded = new Set(previous.map(normalizeQuestion));
  const candidates = STARTER_QUESTION_POOL
    .filter(question => !excluded.has(normalizeQuestion(question)))
    .map(question => ({ question, order: random() }))
    .sort((left, right) => left.order - right.order)
    .map(item => item.question);
  return candidates.slice(0, count);
};

const GENERATION_FOCUS = [
  '时间趋势和月份对比',
  '分类、分类组和消费结构',
  '最高、最低、平均值和笔数',
  '收入、支出和收支差额',
  '备注搜索和具体交易明细',
  '单账本与全部账本的对比',
] as const;

export const generateStarterQuestions = async (options: {
  apiKey: string;
  model: AiModel;
  previous: readonly string[];
  signal?: AbortSignal;
  random?: () => number;
}) => {
  const random = options.random || Math.random;
  const focus = GENERATION_FOCUS[Math.floor(random() * GENERATION_FOCUS.length)];
  const inspirationId = Math.floor(random() * 1_000_000);
  const content = await deepSeekAdapter.complete({
    apiKey: options.apiKey,
    model: options.model,
    signal: options.signal,
    maxTokens: 300,
    messages: [
      {
        role: 'system',
        content: [
          '你是个人账本只读数据助手的“提问灵感”生成器。',
          '只生成用户可以直接点击发送的数据查询问题，不回答问题，不假设任何具体账本数据。',
          '问题只能涉及日期、金额、收入、支出、分类、分类组、备注、账本对比或买卖统计，不得包含新增、修改、删除、预算、导入或同步操作。',
          '只输出4行纯文本，每行一个简短自然的中文问题，不要编号、解释、标题或 Markdown。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `本轮侧重：${focus}。灵感编号：${inspirationId}。`,
          '请避开下面刚刚显示过的问题，也不要只替换时间词来生成高度相似的问题：',
          ...options.previous.map(question => `- ${question}`),
        ].join('\n'),
      },
    ],
  });

  const previousSet = new Set(options.previous.map(normalizeQuestion));
  const generated = parseStarterQuestions(content)
    .filter(question => !previousSet.has(normalizeQuestion(question)))
    .slice(0, 4);
  if (generated.length >= 4) return generated;

  const fallback = pickLocalStarterQuestions(
    [...options.previous, ...generated],
    4 - generated.length,
    random
  );
  return [...generated, ...fallback];
};
