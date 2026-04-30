import {
  createDefaultAppSettings,
  type AgentPreset,
  type AppSettings,
  type ChatSession,
  type ProviderConnection,
  type StorageResult,
} from '@hello-world/shared';

export type StorageSnapshot = {
  sessions: ChatSession[];
  providerConnections: ProviderConnection[];
  agentPresets: AgentPreset[];
  settings: AppSettings;
};

export function createEmptyStorageSnapshot(now: () => string = () => new Date().toISOString()): StorageSnapshot {
  return { sessions: [], providerConnections: [], agentPresets: [], settings: createDefaultAppSettings(now()) };
}

export function ok<T>(value: T): StorageResult<T> {
  return { ok: true, value };
}

export function fail<T>(code: string, message: string): StorageResult<T> {
  return { ok: false, error: { code, message } };
}

export function cloneSnapshot(snapshot: StorageSnapshot): StorageSnapshot {
  return structuredClone(snapshot) as StorageSnapshot;
}
