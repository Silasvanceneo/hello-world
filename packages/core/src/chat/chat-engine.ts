import type { ChatChunk, ChatMessage, ChatSession, MessageContent, ProviderConnection, TokenUsage } from '@hello-world/shared';
import type { ProviderAdapter, ProviderRuntimeContext } from '@hello-world/api-client';

export type ChatEngineContext = {
  now?: () => string;
  createId?: () => string;
};

export type SendChatMessageOptions = {
  session: ChatSession;
  adapter: ProviderAdapter;
  connection: ProviderConnection;
  modelId: string;
  text: string;
  runtime?: ProviderRuntimeContext;
  signal?: AbortSignal;
  context?: ChatEngineContext;
};

export type SendChatMessageResult = {
  session: ChatSession;
  chunks: ChatChunk[];
};

export function createChatAbortController(): AbortController {
  return new AbortController();
}

export async function sendChatMessage(options: SendChatMessageOptions): Promise<SendChatMessageResult> {
  const now = options.context?.now ?? (() => new Date().toISOString());
  const createId = options.context?.createId ?? (() => crypto.randomUUID());
  const userMessage = createTextMessage('user', options.text, now(), createId());
  const sessionWithUser = appendSessionMessage(options.session, userMessage, now());
  const providerMessages = sessionWithUser.messages.map((message) => ({ role: message.role, content: textFromContent(message.content) }));
  const chunks: ChatChunk[] = [];
  let assistantText = '';
  let usage: TokenUsage | undefined;

  for await (const chunk of options.adapter.chat({
    connection: options.connection,
    modelId: options.modelId,
    messages: providerMessages,
    signal: options.signal,
  }, options.runtime)) {
    chunks.push(chunk);
    if (chunk.type === 'text-delta') {
      assistantText = `${assistantText}${chunk.text}`;
    }
    if (chunk.type === 'usage') {
      usage = chunk.usage;
    }
    if (chunk.type === 'error') {
      throw new Error(chunk.error.message);
    }
  }

  const assistantMessage = createAssistantMessage(assistantText, now(), createId(), options.modelId, usage);
  return { session: appendSessionMessage(sessionWithUser, assistantMessage, now()), chunks };
}

export function prepareRetryLastAssistant(session: ChatSession, context: ChatEngineContext = {}): ChatSession {
  const last = session.messages.at(-1);
  if (last?.role !== 'assistant') {
    return session;
  }

  return {
    ...session,
    messages: session.messages.slice(0, -1),
    updatedAt: context.now?.() ?? new Date().toISOString(),
    syncState: 'dirty',
  };
}

export function editUserMessage(session: ChatSession, messageId: string, text: string, context: ChatEngineContext = {}): ChatSession {
  const index = session.messages.findIndex((message) => message.id === messageId);
  if (index < 0 || session.messages[index]?.role !== 'user') {
    throw new Error(`User message not found: ${messageId}`);
  }

  const timestamp = context.now?.() ?? new Date().toISOString();
  const editedMessage: ChatMessage = {
    ...session.messages[index],
    content: [{ type: 'text', text }],
    updatedAt: timestamp,
  };

  return {
    ...session,
    messages: [...session.messages.slice(0, index), editedMessage],
    updatedAt: timestamp,
    syncState: 'dirty',
  };
}

export function createTextMessage(role: ChatMessage['role'], text: string, timestamp: string, id: string): ChatMessage {
  return { id, role, content: [{ type: 'text', text }], createdAt: timestamp, updatedAt: timestamp };
}

function createAssistantMessage(text: string, timestamp: string, id: string, modelId: string, usage?: TokenUsage): ChatMessage {
  return { id, role: 'assistant', modelId, usage, content: [{ type: 'text', text }], createdAt: timestamp, updatedAt: timestamp };
}

function appendSessionMessage(session: ChatSession, message: ChatMessage, updatedAt: string): ChatSession {
  return {
    ...session,
    messages: [...session.messages, message],
    updatedAt,
    syncState: 'dirty',
  };
}

function textFromContent(content: MessageContent[]): string {
  return content
    .filter((item): item is Extract<MessageContent, { type: 'text' | 'reasoning' }> => item.type === 'text' || item.type === 'reasoning')
    .map((item) => item.text)
    .join('\n');
}
