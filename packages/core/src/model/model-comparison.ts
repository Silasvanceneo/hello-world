import type { ChatError, ChatMessage, ChatSession, MessageContent, ProviderConnection, TokenUsage } from '@hello-world/shared';
import type { ProviderAdapter, ProviderRuntimeContext } from '@hello-world/api-client';

export type ModelComparisonCandidate = {
  id: string;
  label?: string;
  adapter: ProviderAdapter;
  connection: ProviderConnection;
  modelId: string;
  runtime?: ProviderRuntimeContext;
};

export type ModelComparisonResult = {
  id: string;
  label: string;
  providerId: string;
  providerName: string;
  modelId: string;
  status: 'fulfilled' | 'failed';
  text: string;
  usage?: TokenUsage;
  durationMs: number;
  error?: ChatError;
  startedAt: string;
  completedAt: string;
};

export type ModelComparisonRun = {
  id: string;
  prompt: string;
  createdAt: string;
  results: ModelComparisonResult[];
};

export type CompareModelsOptions = {
  session: ChatSession;
  prompt: string;
  candidates: ModelComparisonCandidate[];
  signal?: AbortSignal;
  context?: {
    now?: () => string;
    nowMs?: () => number;
    createId?: () => string;
  };
};

export type SaveComparisonSelectionOptions = {
  session: ChatSession;
  run: ModelComparisonRun;
  resultId: string;
  context?: {
    now?: () => string;
    createId?: () => string;
  };
};

export async function compareModels(options: CompareModelsOptions): Promise<ModelComparisonRun> {
  if (options.candidates.length === 0) {
    throw new Error('At least one model candidate is required.');
  }

  const now = options.context?.now ?? (() => new Date().toISOString());
  const createId = options.context?.createId ?? (() => crypto.randomUUID());
  const createdAt = now();
  const results = await Promise.all(options.candidates.map((candidate) => compareCandidate(candidate, options, now)));
  return { id: createId(), prompt: options.prompt, createdAt, results };
}

export function saveComparisonSelection(options: SaveComparisonSelectionOptions): ChatSession {
  const result = options.run.results.find((item) => item.id === options.resultId);
  if (!result) {
    throw new Error(`Comparison result not found: ${options.resultId}`);
  }
  if (result.status !== 'fulfilled') {
    throw new Error(`Cannot save failed comparison result: ${options.resultId}`);
  }

  const now = options.context?.now ?? (() => new Date().toISOString());
  const createId = options.context?.createId ?? (() => crypto.randomUUID());
  const userTimestamp = now();
  const assistantTimestamp = now();
  const userMessage = createTextMessage('user', options.run.prompt, userTimestamp, createId());
  const assistantMessage: ChatMessage = {
    id: createId(),
    role: 'assistant',
    modelId: result.modelId,
    usage: result.usage,
    content: [{ type: 'text', text: result.text }],
    createdAt: assistantTimestamp,
    updatedAt: assistantTimestamp,
  };

  return {
    ...options.session,
    messages: [...options.session.messages, userMessage, assistantMessage],
    updatedAt: assistantTimestamp,
    syncState: 'dirty',
  };
}

async function compareCandidate(
  candidate: ModelComparisonCandidate,
  options: CompareModelsOptions,
  now: () => string,
): Promise<ModelComparisonResult> {
  const nowMs = options.context?.nowMs ?? (() => performance.now());
  const startedAt = now();
  const startedMs = nowMs();
  let text = '';
  let usage: TokenUsage | undefined;

  try {
    for await (const chunk of candidate.adapter.chat({
      connection: candidate.connection,
      modelId: candidate.modelId,
      messages: toProviderMessages(options.session, options.prompt),
      signal: options.signal,
    }, candidate.runtime)) {
      if (chunk.type === 'text-delta') {
        text = `${text}${chunk.text}`;
      }
      if (chunk.type === 'usage') {
        usage = chunk.usage;
      }
      if (chunk.type === 'error') {
        return completedCandidate(candidate, 'failed', text, usage, startedAt, now(), nowMs() - startedMs, chunk.error);
      }
    }
    return completedCandidate(candidate, 'fulfilled', text, usage, startedAt, now(), nowMs() - startedMs);
  } catch (error) {
    return completedCandidate(candidate, 'failed', text, usage, startedAt, now(), nowMs() - startedMs, toChatError(error));
  }
}

function completedCandidate(
  candidate: ModelComparisonCandidate,
  status: ModelComparisonResult['status'],
  text: string,
  usage: TokenUsage | undefined,
  startedAt: string,
  completedAt: string,
  durationMs: number,
  error?: ChatError,
): ModelComparisonResult {
  return {
    id: candidate.id,
    label: candidate.label ?? `${candidate.connection.name} / ${candidate.modelId}`,
    providerId: candidate.connection.id,
    providerName: candidate.connection.name,
    modelId: candidate.modelId,
    status,
    text,
    usage,
    durationMs: Math.max(0, Math.round(durationMs)),
    error,
    startedAt,
    completedAt,
  };
}

function toProviderMessages(session: ChatSession, prompt: string) {
  return [
    ...session.messages.map((message) => ({ role: message.role, content: textFromContent(message.content) })),
    { role: 'user' as const, content: prompt },
  ];
}

function createTextMessage(role: ChatMessage['role'], text: string, timestamp: string, id: string): ChatMessage {
  return { id, role, content: [{ type: 'text', text }], createdAt: timestamp, updatedAt: timestamp };
}

function textFromContent(content: MessageContent[]): string {
  return content
    .filter((item): item is Extract<MessageContent, { type: 'text' | 'reasoning' }> => item.type === 'text' || item.type === 'reasoning')
    .map((item) => item.text)
    .join('\n');
}

function toChatError(error: unknown): ChatError {
  const message = error instanceof Error ? error.message : 'Unknown comparison error.';
  const lower = message.toLowerCase();
  if (lower.includes('abort')) {
    return { code: 'aborted', message, retryable: true };
  }
  if (lower.includes('401') || lower.includes('403') || lower.includes('auth')) {
    return { code: 'auth', message, retryable: false };
  }
  if (lower.includes('429') || lower.includes('rate')) {
    return { code: 'rate_limit', message, retryable: true };
  }
  if (lower.includes('model')) {
    return { code: 'model', message, retryable: false };
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return { code: 'network', message, retryable: true };
  }
  return { code: 'unknown', message, retryable: true };
}
