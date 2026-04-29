export type ProviderType =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'grok'
  | 'ollama'
  | 'openai-compatible'
  | 'custom';

export type ProviderConnection = {
  id: string;
  type: ProviderType;
  name: string;
  baseUrl?: string;
  apiKeyRef?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ModelCapability = {
  supportsText: boolean;
  supportsVision: boolean;
  supportsFiles: boolean;
  supportsTools: boolean;
  supportsReasoning: boolean;
  supportsImageGeneration: boolean;
  supportsAudioInput: boolean;
  supportsAudioOutput: boolean;
  contextWindow?: number;
  maxOutputTokens?: number;
};

export type AIModel = {
  id: string;
  providerId: string;
  displayName: string;
  ownedBy?: string;
  capability: ModelCapability;
  status: 'available' | 'unavailable' | 'unknown';
};

export type ConnectionStatus =
  | { ok: true; checkedAt: string; models?: AIModel[] }
  | { ok: false; checkedAt: string; reason: 'auth' | 'network' | 'model' | 'unknown'; message: string };
