import type { AgentPreset, AppSettings, ChatSession, ProviderConnection, StorageResult } from '@hello-world/shared';

export interface StorageAdapter {
  listSessions(): Promise<StorageResult<ChatSession[]>>;
  saveSession(session: ChatSession): Promise<StorageResult<ChatSession>>;
  deleteSession(sessionId: string): Promise<StorageResult<void>>;
  listProviderConnections(): Promise<StorageResult<ProviderConnection[]>>;
  saveProviderConnection(connection: ProviderConnection): Promise<StorageResult<ProviderConnection>>;
  deleteProviderConnection(connectionId: string): Promise<StorageResult<void>>;
  listAgentPresets(): Promise<StorageResult<AgentPreset[]>>;
  saveAgentPreset(preset: AgentPreset): Promise<StorageResult<AgentPreset>>;
  deleteAgentPreset(presetId: string): Promise<StorageResult<void>>;
  getSettings(): Promise<StorageResult<AppSettings>>;
  saveSettings(settings: AppSettings): Promise<StorageResult<AppSettings>>;
}
