import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { deleteChatSession, loadChatSessions, saveChatSession } from '../packages/core/src/chat/chat-persistence.ts';
import { createJsonFileStorageAdapter, createKeyValueStorageAdapter, createMobileStorageAdapter, type KeyValueStore } from '../packages/storage/src/index.ts';
import type { ChatSession, ProviderConnection } from '@hello-world/shared';

function session(id: string): ChatSession {
  return { id, title: id, messages: [], tags: [], createdAt: '2026-04-29T00:00:00.000Z', updatedAt: '2026-04-29T00:00:00.000Z', syncState: 'dirty' };
}

function connection(id: string): ProviderConnection {
  return { id, type: 'openai-compatible', name: id, enabled: true, createdAt: '2026-04-29T00:00:00.000Z', updatedAt: '2026-04-29T00:00:00.000Z' };
}

class MemoryKeyValueStore implements KeyValueStore {
  readonly values = new Map<string, string>();

  async getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  async removeItem(key: string) {
    this.values.delete(key);
  }
}

test('JSON file storage persists sessions, provider connections, and settings across instances', async () => {
  const workspace = resolve('.');
  const scratch = resolve('.tmp-tests/storage-json');
  assert.ok(scratch.startsWith(workspace));
  await rm(scratch, { recursive: true, force: true });
  await mkdir(scratch, { recursive: true });

  const filePath = join(scratch, 'state.json');
  const first = createJsonFileStorageAdapter(filePath, { now: () => '2026-04-29T00:00:00.000Z' });
  await saveChatSession(first, session('session-1'));
  await first.saveProviderConnection(connection('provider-1'));
  await first.saveSettings({ theme: 'dark', language: 'zh-CN', defaultProviderId: 'provider-1', updatedAt: '2026-04-29T01:00:00.000Z' });

  const second = createJsonFileStorageAdapter(filePath, { now: () => '2026-04-29T02:00:00.000Z' });
  const sessions = await loadChatSessions(second);
  const providers = await second.listProviderConnections();
  const settings = await second.getSettings();

  assert.equal(sessions.ok && sessions.value[0]?.id, 'session-1');
  assert.equal(providers.ok && providers.value[0]?.id, 'provider-1');
  assert.equal(settings.ok && settings.value.theme, 'dark');

  await deleteChatSession(second, 'session-1');
  const afterDelete = await second.listSessions();
  assert.deepEqual(afterDelete.ok && afterDelete.value, []);
});

test('key-value and mobile storage adapters share the same persistence contract', async () => {
  const keyValueStore = new MemoryKeyValueStore();
  const webLike = createKeyValueStorageAdapter(keyValueStore, { key: 'web' });
  await webLike.saveSession(session('web-session'));
  const webReloaded = createKeyValueStorageAdapter(keyValueStore, { key: 'web' });
  const webSessions = await webReloaded.listSessions();
  assert.equal(webSessions.ok && webSessions.value[0]?.id, 'web-session');

  const mobileStore = new MemoryKeyValueStore();
  const mobile = createMobileStorageAdapter(mobileStore);
  await mobile.saveProviderConnection(connection('mobile-provider'));
  const mobileReloaded = createMobileStorageAdapter(mobileStore);
  const mobileProviders = await mobileReloaded.listProviderConnections();
  assert.equal(mobileProviders.ok && mobileProviders.value[0]?.id, 'mobile-provider');
});
