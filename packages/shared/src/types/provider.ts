export type ProviderType =
  | 'openai'
  | 'azure-openai'
  | 'anthropic'
  | 'gemini'
  | 'dashscope'
  | 'grok'
  | 'ollama'
  | 'openai-compatible'
  | 'custom';

export type ProviderConnection = {
  id: string;
  type: ProviderType;
  name: string;
  baseUrl?: string;
  defaultModelId?: string;
  imageModelId?: string;
  apiKeyRef?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProviderConnectionDraft = {
  type: ProviderType;
  name: string;
  baseUrl?: string;
  defaultModelId?: string;
  imageModelId?: string;
  apiKeyRef?: string;
  enabled?: boolean;
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

export type ProviderFeatureSupport = 'supported' | 'unsupported' | 'unknown';

export type ProviderRuntimeProtocol =
  | 'openai-compatible'
  | 'openai-responses'
  | 'azure-openai'
  | 'anthropic-messages'
  | 'gemini-native'
  | 'dashscope-native'
  | 'ollama'
  | 'custom';

export type ProviderRuntimeTransport = 'https' | 'local-http' | 'desktop-bridge' | 'custom';

export type ProviderBrowserDirectSupport = 'supported' | 'cors-dependent' | 'unsupported';

export type ProviderRuntimeCapabilities = {
  protocol: ProviderRuntimeProtocol;
  transport: ProviderRuntimeTransport;
  browserDirect: ProviderBrowserDirectSupport;
  models: {
    list: boolean;
    dynamicCapabilities: boolean;
  };
  chat: {
    streaming: boolean;
    systemMessages: boolean;
    toolCalls: ProviderFeatureSupport;
  };
  embeddings: ProviderFeatureSupport;
  imageGeneration: ProviderFeatureSupport;
  audioInput: ProviderFeatureSupport;
  audioOutput: ProviderFeatureSupport;
  toolCalls: ProviderFeatureSupport;
};

export type ProviderCapabilitySummary = {
  providerType: ProviderType;
  adapterId: string;
  protocol: ProviderRuntimeProtocol;
  transport: ProviderRuntimeTransport;
  browserDirect: ProviderBrowserDirectSupport;
  features: {
    modelListing: boolean;
    chatStreaming: boolean;
    embeddings: ProviderFeatureSupport;
    imageGeneration: ProviderFeatureSupport;
    audioInput: ProviderFeatureSupport;
    audioOutput: ProviderFeatureSupport;
    toolCalls: ProviderFeatureSupport;
  };
};

export type ProviderErrorReason = 'auth' | 'network' | 'model' | 'configuration' | 'unknown';

export type ConnectionStatus =
  | { ok: true; checkedAt: string; models?: AIModel[] }
  | { ok: false; checkedAt: string; reason: ProviderErrorReason; message: string };

export const textOnlyModelCapability: ModelCapability = {
  supportsText: true,
  supportsVision: false,
  supportsFiles: false,
  supportsTools: false,
  supportsReasoning: false,
  supportsImageGeneration: false,
  supportsAudioInput: false,
  supportsAudioOutput: false,
};
