import type { TokenUsage } from './chat.ts';

export type UsageRecord = {
  id: string;
  sessionId: string;
  messageId: string;
  providerId?: string;
  modelId?: string;
  usage: TokenUsage;
  createdAt: string;
};

export type UsageSummary = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost?: number;
};

export type UsageBucket = UsageSummary & {
  key: string;
  records: number;
};
