import type { AppSettings, ChatSession, ProviderConnection, StorageResult } from '@hello-world/shared';
import type { StorageAdapter } from './storage-adapter.ts';
import { cloneSnapshot, createEmptyStorageSnapshot, fail, ok, type StorageSnapshot } from './snapshot.ts';

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem?(key: string): Promise<void>;
}

export type KeyValueStorageOptions = {
  key?: string;
  now?: () => string;
};

export function createKeyValueStorageAdapter(store: KeyValueStore, options: KeyValueStorageOptions = {}): StorageAdapter {
  const key = options.key ?? 'hello-world:storage:v1';
  const now = options.now ?? (() => new Date().toISOString());

  async function readSnapshot(): Promise<StorageSnapshot> {
    const raw = await store.getItem(key);
    if (!raw) {
      return createEmptyStorageSnapshot(now);
    }
    return { ...createEmptyStorageSnapshot(now), ...JSON.parse(raw) } as StorageSnapshot;
  }

  async function writeSnapshot(snapshot: StorageSnapshot): Promise<void> {
    await store.setItem(key, JSON.stringify(snapshot));
  }

  return createSnapshotBackedStorageAdapter(readSnapshot, writeSnapshot);
}

export function createSnapshotBackedStorageAdapter(
  readSnapshot: () => Promise<StorageSnapshot>,
  writeSnapshot: (snapshot: StorageSnapshot) => Promise<void>,
): StorageAdapter {
  return {
    async listSessions() {
      return guard(async () => ok(cloneSnapshot(await readSnapshot()).sessions));
    },
    async saveSession(session) {
      return guard(async () => {
        const snapshot = await readSnapshot();
        const sessions = upsertById(snapshot.sessions, session);
        await writeSnapshot({ ...snapshot, sessions });
        return ok(session);
      });
    },
    async deleteSession(sessionId) {
      return guard(async () => {
        const snapshot = await readSnapshot();
        await writeSnapshot({ ...snapshot, sessions: snapshot.sessions.filter((session) => session.id !== sessionId) });
        return ok(undefined);
      });
    },
    async listProviderConnections() {
      return guard(async () => ok(cloneSnapshot(await readSnapshot()).providerConnections));
    },
    async saveProviderConnection(connection) {
      return guard(async () => {
        const snapshot = await readSnapshot();
        const providerConnections = upsertById(snapshot.providerConnections, connection);
        await writeSnapshot({ ...snapshot, providerConnections });
        return ok(connection);
      });
    },
    async deleteProviderConnection(connectionId) {
      return guard(async () => {
        const snapshot = await readSnapshot();
        await writeSnapshot({ ...snapshot, providerConnections: snapshot.providerConnections.filter((connection) => connection.id !== connectionId) });
        return ok(undefined);
      });
    },
    async getSettings() {
      return guard(async () => ok(cloneSnapshot(await readSnapshot()).settings));
    },
    async saveSettings(settings) {
      return guard(async () => {
        const snapshot = await readSnapshot();
        await writeSnapshot({ ...snapshot, settings });
        return ok(settings);
      });
    },
  };
}

function upsertById<T extends { id: string }>(items: T[], item: T): T[] {
  const exists = items.some((candidate) => candidate.id === item.id);
  return exists ? items.map((candidate) => (candidate.id === item.id ? item : candidate)) : [item, ...items];
}

async function guard<T>(operation: () => Promise<StorageResult<T>>): Promise<StorageResult<T>> {
  try {
    return await operation();
  } catch (error) {
    return fail('storage_error', error instanceof Error ? error.message : 'Unknown storage error.');
  }
}
