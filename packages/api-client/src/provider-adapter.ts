import type { AIModel, ChatChunk, ConnectionStatus, ProviderConnection } from '@hello-world/shared';

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
  listModels(connection: ProviderConnection): Promise<AIModel[]>;
  chat(request: ChatRequest): AsyncIterable<ChatChunk>;
  validateConnection(connection: ProviderConnection): Promise<ConnectionStatus>;
  generateImage?(request: ImageRequest): Promise<ImageResult>;
}
