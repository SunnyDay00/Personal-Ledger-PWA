import { afterEach, describe, expect, it, vi } from 'vitest';
import { deepSeekAdapter } from './deepseek';
import {
  generateStarterQuestions,
  parseStarterQuestions,
  pickLocalStarterQuestions,
} from './aiSuggestions';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AI starter questions', () => {
  it('parses numbered model output and removes unsupported write actions', () => {
    expect(parseStarterQuestions([
      '1. 今年哪个月的支出最高？',
      '2. 按分类分析最近半年的消费',
      '3. 帮我新增一笔餐饮支出',
      '4. 全部账本的收入分别是多少',
      '5. 全部账本的收入分别是多少',
    ].join('\n'))).toEqual([
      '今年哪个月的支出最高？',
      '按分类分析最近半年的消费？',
      '全部账本的收入分别是多少？',
    ]);
  });

  it('accepts a fenced JSON question list from the provider', () => {
    expect(parseStarterQuestions([
      '```json',
      '["本月支出最高的分类是什么？", "今年收入一共有多少笔？"]',
      '```',
    ].join('\n'))).toEqual([
      '本月支出最高的分类是什么？',
      '今年收入一共有多少笔？',
    ]);
  });

  it('picks a fresh local set when the provider is unavailable', () => {
    const previous = [
      '这个月哪一类花得最多？',
      '比较最近三个月的支出变化',
    ];
    const next = pickLocalStarterQuestions(previous, 4, () => 0);
    expect(next).toHaveLength(4);
    expect(next).not.toContain(previous[0]);
    expect(next).not.toContain(previous[1]);
    expect(new Set(next).size).toBe(4);
  });

  it('asks DeepSeek for four replacement questions without ledger records', async () => {
    const completion = vi.spyOn(deepSeekAdapter, 'complete').mockResolvedValue([
      '最近三个月哪类支出增长最快？',
      '今年收入最高的是哪个月？',
      '按账本比较本月的消费金额？',
      '备注中提到聚餐的记录有多少笔？',
    ].join('\n'));
    const previous = ['近一年最高一次消费是什么？'];
    const result = await generateStarterQuestions({
      apiKey: 'secret-key',
      model: 'deepseek-v4-flash',
      previous,
      random: () => 0,
    });

    expect(result).toHaveLength(4);
    expect(result).not.toContain(previous[0]);
    expect(completion).toHaveBeenCalledOnce();
    const request = completion.mock.calls[0][0];
    expect(request.maxTokens).toBe(300);
    expect(request.messages.at(-1)?.content).toContain(previous[0]);
  });
});
