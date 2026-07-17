import { AiConfig, AiModel } from '../types';

export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
export const DEFAULT_DEEPSEEK_MODEL: AiModel = 'deepseek-v4-flash';
export const DEEPSEEK_MODEL = DEFAULT_DEEPSEEK_MODEL;
export const DEEPSEEK_MODELS: ReadonlyArray<{
  id: AiModel;
  name: string;
  description: string;
}> = [
  {
    id: 'deepseek-v4-flash',
    name: 'DeepSeek V4 Flash',
    description: '响应更快，适合日常查询与统计',
  },
  {
    id: 'deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    description: '能力更强，适合复杂分析与长对话',
  },
];

export const isDeepSeekModel = (value: unknown): value is AiModel =>
  DEEPSEEK_MODELS.some(model => model.id === value);

export const getDeepSeekModelName = (model: AiModel) =>
  DEEPSEEK_MODELS.find(option => option.id === model)?.name || model;

export const createDefaultAiConfig = (): AiConfig => ({
  id: 'main',
  provider: 'deepseek',
  model: DEFAULT_DEEPSEEK_MODEL,
  apiKey: '',
  updatedAt: 0,
});

export const normalizeAiConfig = (
  value?: Partial<AiConfig> | null,
  fallback?: Partial<AiConfig> | null
): AiConfig => {
  const source = { ...(fallback || {}), ...(value || {}) };
  const consentAt = Number(source.dataConsentAt);
  const updatedAt = Number(source.updatedAt);
  const model = isDeepSeekModel(source.model)
    ? source.model
    : DEFAULT_DEEPSEEK_MODEL;

  return {
    id: 'main',
    provider: 'deepseek',
    model,
    apiKey: typeof source.apiKey === 'string' ? source.apiKey.trim() : '',
    dataConsentAt: Number.isFinite(consentAt) && consentAt > 0 ? consentAt : undefined,
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : 0,
  };
};
