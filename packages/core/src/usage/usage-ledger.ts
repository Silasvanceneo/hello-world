import type { ChatMessage, ChatSession, TokenUsage, UsageBucket, UsageRecord, UsageSummary } from '@hello-world/shared';

export type UsageRecordContext = {
  now?: () => string;
  createId?: () => string;
  providerId?: string;
};

export function createUsageRecordFromMessage(
  session: ChatSession,
  message: ChatMessage,
  context: UsageRecordContext = {},
): UsageRecord | undefined {
  if (!message.usage) {
    return undefined;
  }

  return {
    id: context.createId?.() ?? crypto.randomUUID(),
    sessionId: session.id,
    messageId: message.id,
    providerId: context.providerId,
    modelId: message.modelId ?? session.modelId,
    usage: message.usage,
    createdAt: context.now?.() ?? message.updatedAt,
  };
}

export function collectUsageRecords(session: ChatSession, context: UsageRecordContext = {}): UsageRecord[] {
  return session.messages
    .map((message) => createUsageRecordFromMessage(session, message, context))
    .filter((record): record is UsageRecord => Boolean(record));
}

export function summarizeUsage(records: UsageRecord[]): UsageSummary {
  return records.reduce<UsageSummary>(
    (summary, record) => addUsage(summary, record.usage),
    { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  );
}

export function aggregateUsageByModel(records: UsageRecord[]): UsageBucket[] {
  return aggregateUsage(records, (record) => record.modelId ?? 'unknown-model');
}

export function aggregateUsageByDay(records: UsageRecord[]): UsageBucket[] {
  return aggregateUsage(records, (record) => record.createdAt.slice(0, 10));
}

export function formatUsageSummary(summary: UsageSummary): string {
  const cost = summary.estimatedCost === undefined ? '' : `, estimated cost ${summary.estimatedCost.toFixed(4)}`;
  return `${summary.totalTokens} tokens (${summary.promptTokens} prompt, ${summary.completionTokens} completion${cost})`;
}

function aggregateUsage(records: UsageRecord[], getKey: (record: UsageRecord) => string): UsageBucket[] {
  const buckets = new Map<string, UsageBucket>();
  for (const record of records) {
    const key = getKey(record);
    const current = buckets.get(key) ?? { key, records: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    buckets.set(key, { ...addUsage(current, record.usage), key, records: current.records + 1 });
  }
  return [...buckets.values()].sort((left, right) => left.key.localeCompare(right.key));
}

function addUsage<T extends UsageSummary>(summary: T, usage: TokenUsage): T {
  return {
    ...summary,
    promptTokens: summary.promptTokens + usage.promptTokens,
    completionTokens: summary.completionTokens + usage.completionTokens,
    totalTokens: summary.totalTokens + usage.totalTokens,
    estimatedCost: addOptional(summary.estimatedCost, usage.estimatedCost),
  };
}

function addOptional(left: number | undefined, right: number | undefined): number | undefined {
  if (left === undefined && right === undefined) {
    return undefined;
  }
  return (left ?? 0) + (right ?? 0);
}
