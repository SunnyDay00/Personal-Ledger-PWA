import { db } from './db';
import { AiConfig, AiConversation, AiMessage } from '../types';
import { DEFAULT_SETTINGS } from '../constants';
import {
  createDefaultAiConfig,
  DEEPSEEK_BASE_URL,
  DEEPSEEK_MODEL,
  DEEPSEEK_MODELS,
  DEFAULT_DEEPSEEK_MODEL,
  getDeepSeekModelName,
  normalizeAiConfig,
} from './aiConfig';

export {
  createDefaultAiConfig,
  DEEPSEEK_BASE_URL,
  DEEPSEEK_MODEL,
  DEEPSEEK_MODELS,
  DEFAULT_DEEPSEEK_MODEL,
  getDeepSeekModelName,
  normalizeAiConfig,
};

export const aiStorage = {
  async getConfig(): Promise<AiConfig> {
    const settingsRow = await db.settings.get('main');
    if (settingsRow?.value.aiConfig) {
      return normalizeAiConfig(settingsRow.value.aiConfig);
    }
    return normalizeAiConfig(await db.aiConfig.get('main'));
  },

  async saveConfig(changes: Partial<Omit<AiConfig, 'id' | 'provider'>>): Promise<AiConfig> {
    const current = await this.getConfig();
    const next = normalizeAiConfig({
      ...current,
      ...changes,
      updatedAt: Date.now(),
    });
    await db.transaction('rw', db.settings, db.aiConfig, async () => {
      const settingsRow = await db.settings.get('main');
      const settings = settingsRow?.value || DEFAULT_SETTINGS;
      await db.settings.put({
        key: 'main',
        value: {
          ...settings,
          aiConfig: next,
        },
      });
      await db.aiConfig.put(next);
    });
    return next;
  },

  async deleteApiKey(): Promise<AiConfig> {
    return this.saveConfig({ apiKey: '', dataConsentAt: undefined });
  },

  async listConversations(): Promise<AiConversation[]> {
    return db.aiConversations.orderBy('updatedAt').reverse().toArray();
  },

  async getConversation(id: string): Promise<AiConversation | undefined> {
    return db.aiConversations.get(id);
  },

  async saveConversation(conversation: AiConversation): Promise<void> {
    await db.aiConversations.put(conversation);
  },

  async listMessages(conversationId: string): Promise<AiMessage[]> {
    return db.aiMessages.where('conversationId').equals(conversationId).sortBy('createdAt');
  },

  async saveMessage(message: AiMessage): Promise<void> {
    await db.aiMessages.put(message);
  },

  async deleteMessage(id: string): Promise<void> {
    await db.aiMessages.delete(id);
  },

  async deleteConversation(id: string): Promise<void> {
    await db.transaction('rw', db.aiConversations, db.aiMessages, async () => {
      await db.aiConversations.delete(id);
      await db.aiMessages.where('conversationId').equals(id).delete();
    });
  },

  async clearConversations(): Promise<void> {
    await db.transaction('rw', db.aiConversations, db.aiMessages, async () => {
      await db.aiConversations.clear();
      await db.aiMessages.clear();
    });
  },
};
