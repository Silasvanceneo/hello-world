import type { AIModel, ChatChunk, ConnectionStatus, ProviderConnection, ProviderRuntimeCapabilities } from '@hello-world/shared';

export type ProviderRuntimeContext = {
  apiKey?: string;
  fetch?: typeof fetch;
  now?: () => string;
};

export type ChatRequest = {
  connection: ProviderConnection;
  modelId: AIModel['id'];
  messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>;
  signal?: AbortSignal;
};

export type ImageRequest = {
  connection: ProviderConnection;
  prompt: string;
  modelId?: string;
};

export type ImageResult = {
  images: Array<{ mimeType: string; data: string }>;
};

export interface ProviderAdapter {
  id: string;
  type: ProviderConnection['type'];
  capabilities: ProviderRuntimeCapabilities;
  listModels(connection: ProviderConnection, context?: ProviderRuntimeContext): Promise<AIModel[]>;
  chat(request: ChatRequest, context?: ProviderRuntimeContext): AsyncIterable<ChatChunk>;
  validateConnection(connection: ProviderConnection, context?: ProviderRuntimeContext): Promise<ConnectionStatus>;
  generateImage?(request: ImageRequest, context?: ProviderRuntimeContext): Promise<ImageResult>;
}
