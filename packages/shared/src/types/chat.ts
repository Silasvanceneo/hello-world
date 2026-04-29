import type { AIModel } from './provider';

export type SyncState = 'local' | 'synced' | 'dirty' | 'syncing' | 'conflict' | 'error';

export type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost?: number;
  currency?: 'USD' | 'CNY';
};

export type MessageContent =
  | { type: 'text'; text: string }
  | { type: 'image'; fileId: string; mimeType: string }
  | { type: 'file'; fileId: string; name: string; mimeType: string }
  | { type: 'tool-call'; toolCallId: string; name: string; args: unknown }
  | { type: 'tool-result'; toolCallId: string; result: unknown }
  | { type: 'reasoning'; text: string }
  | { type: 'citation'; sourceId: string; label: string };

export type ChatMessage = {
  id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: MessageContent[];
  modelId?: AIModel['id'];
  usage?: TokenUsage;
  createdAt: string;
  updatedAt: string;
};

export type ChatSession = {
  id: string;
  title: string;
  folderId?: string;
  messages: ChatMessage[];
  modelId?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  syncState: SyncState;
};

export type ChatError = {
  code: 'auth' | 'network' | 'rate_limit' | 'model' | 'aborted' | 'unknown';
  message: string;
  retryable: boolean;
};

export type ChatChunk =
  | { type: 'text-delta'; text: string }
  | { type: 'reasoning-delta'; text: string }
  | { type: 'tool-call-start'; id: string; name: string }
  | { type: 'tool-call-delta'; id: string; argsDelta: string }
  | { type: 'tool-call-end'; id: string }
  | { type: 'usage'; usage: TokenUsage }
  | { type: 'error'; error: ChatError }
  | { type: 'done' };
