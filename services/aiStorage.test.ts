import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { AiMessage } from '../types';
import { db } from './db';
import { aiStorage } from './aiStorage';

beforeEach(async () => {
  await db.open();
  await db.settings.clear();
  await db.aiConfig.clear();
  await db.aiConversations.clear();
  await db.aiMessages.clear();
});

afterAll(async () => {
  await db.delete();
});

describe('AI storage and synchronization boundary', () => {
  it('stores config in AppSettings and preserves it while clearing local conversations', async () => {
    const savedConfig = await aiStorage.saveConfig({ apiKey: 'synced-secret', dataConsentAt: 1 });
    const conversation = {
      id: 'conversation',
      title: '测试',
      defaultLedgerId: 'ledger',
      createdAt: 1,
      updatedAt: 1,
    };
    const message: AiMessage = {
      id: 'message',
      conversationId: conversation.id,
      role: 'user',
      content: '测试',
      status: 'complete',
      createdAt: 1,
    };
    await aiStorage.saveConversation(conversation);
    await aiStorage.saveMessage(message);
    await aiStorage.clearConversations();

    const settingsRow = await db.settings.get('main');
    expect(settingsRow?.value.aiConfig).toMatchObject({
      apiKey: 'synced-secret',
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
    });
    expect(await db.aiConfig.get('main')).toEqual(savedConfig);
    expect(await aiStorage.getConfig()).toMatchObject({ apiKey: 'synced-secret' });
    expect(await aiStorage.listConversations()).toEqual([]);
    expect(await aiStorage.listMessages(conversation.id)).toEqual([]);
    expect(JSON.stringify(settingsRow?.value)).not.toContain('conversation');
    expect(JSON.stringify(settingsRow?.value)).not.toContain('测试');
  });

  it('prefers synchronized AppSettings over a stale compatibility-table key', async () => {
    await aiStorage.saveConfig({ apiKey: 'settings-key' });
    await db.aiConfig.put({
      id: 'main',
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      apiKey: 'stale-legacy-key',
      updatedAt: Date.now() + 1000,
    });

    expect(await aiStorage.getConfig()).toMatchObject({ apiKey: 'settings-key' });
  });

  it('reads a legacy aiConfig-table key when AppSettings has not been migrated yet', async () => {
    await db.aiConfig.put({
      id: 'main',
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      apiKey: 'legacy-key',
      dataConsentAt: 1,
      updatedAt: 2,
    });

    expect(await aiStorage.getConfig()).toMatchObject({
      apiKey: 'legacy-key',
      dataConsentAt: 1,
    });
  });

  it('persists a selected DeepSeek model in synchronized settings and the compatibility table', async () => {
    const config = await aiStorage.saveConfig({
      apiKey: 'model-key',
      model: 'deepseek-v4-pro',
    });

    expect(config.model).toBe('deepseek-v4-pro');
    expect((await db.settings.get('main'))?.value.aiConfig?.model).toBe('deepseek-v4-pro');
    expect((await db.aiConfig.get('main'))?.model).toBe('deepseek-v4-pro');
  });

  it('deletes messages together with their conversation', async () => {
    const conversation = {
      id: 'conversation',
      title: '测试',
      defaultLedgerId: 'ledger',
      createdAt: 1,
      updatedAt: 1,
    };
    await aiStorage.saveConversation(conversation);
    await aiStorage.saveMessage({
      id: 'message',
      conversationId: conversation.id,
      role: 'assistant',
      content: '结果',
      status: 'complete',
      createdAt: 2,
    });
    await aiStorage.deleteConversation(conversation.id);
    expect(await aiStorage.getConversation(conversation.id)).toBeUndefined();
    expect(await aiStorage.listMessages(conversation.id)).toEqual([]);
  });
});
