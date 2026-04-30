import type {
  AgentPreset,
  AppSettings,
  ChatMessage,
  ChatSession,
  MessageContent,
  PromptTemplate,
  ProviderConnection,
} from '@hello-world/shared';
import { redactSensitiveText } from '../security/security-policy.ts';

export type BackupArchive = {
  app: 'hello-world';
  version: 1;
  exportedAt: string;
  sessions: ChatSession[];
  providers: Omit<ProviderConnection, 'apiKeyRef'>[];
  settings?: AppSettings;
  promptTemplates: PromptTemplate[];
  agentPresets: AgentPreset[];
};

export type BackupInput = {
  sessions?: ChatSession[];
  providers?: ProviderConnection[];
  settings?: AppSettings;
  promptTemplates?: PromptTemplate[];
  agentPresets?: AgentPreset[];
};

export type ImportOptions = {
  importedAt?: string;
};

export type BackupOptions = {
  exportedAt?: string;
};

export function exportSessionMarkdown(session: ChatSession): string {
  const lines = [
    `# ${redactSensitiveText(session.title)}`,
    '',
    `- Session ID: ${session.id}`,
    `- Created: ${session.createdAt}`,
    `- Updated: ${session.updatedAt}`,
    `- Tags: ${session.tags.length > 0 ? session.tags.join(', ') : 'none'}`,
    '',
    ...attachmentLines(session),
    ...session.messages.flatMap(messageMarkdown),
  ];
  return `${lines.join('\n').trim()}\n`;
}

export function createBackupArchive(input: BackupInput, options: BackupOptions = {}): BackupArchive {
  return {
    app: 'hello-world',
    version: 1,
    exportedAt: options.exportedAt ?? new Date().toISOString(),
    sessions: input.sessions ?? [],
    providers: (input.providers ?? []).map(stripProviderSecretRef),
    settings: input.settings,
    promptTemplates: input.promptTemplates ?? [],
    agentPresets: input.agentPresets ?? [],
  };
}

export function restoreBackupArchive(raw: string | unknown): BackupArchive {
  const archive = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!isRecord(archive) || archive.app !== 'hello-world' || archive.version !== 1) {
    throw new Error('Backup archive must be a hello-world v1 export.');
  }
  return {
    app: 'hello-world',
    version: 1,
    exportedAt: String(archive.exportedAt ?? new Date().toISOString()),
    sessions: Array.isArray(archive.sessions) ? archive.sessions as ChatSession[] : [],
    providers: Array.isArray(archive.providers)
      ? (archive.providers as ProviderConnection[]).map(stripProviderSecretRef)
      : [],
    settings: isRecord(archive.settings) ? archive.settings as AppSettings : undefined,
    promptTemplates: Array.isArray(archive.promptTemplates) ? archive.promptTemplates as PromptTemplate[] : [],
    agentPresets: Array.isArray(archive.agentPresets) ? archive.agentPresets as AgentPreset[] : [],
  };
}

export function importChatGPTExport(raw: string | unknown, options: ImportOptions = {}): ChatSession[] {
  const conversations = asArray(typeof raw === 'string' ? JSON.parse(raw) : raw);
  return conversations.map((conversation, index) => chatGptConversationToSession(conversation, index, options));
}

export function importOpenWebUIExport(raw: string | unknown, options: ImportOptions = {}): ChatSession[] {
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const chats = asArray(isRecord(parsed) && Array.isArray(parsed.chats) ? parsed.chats : parsed);
  return chats.map((chat, index) => openWebUiChatToSession(chat, index, options));
}

function attachmentLines(session: ChatSession): string[] {
  if (!session.attachments?.length) {
    return [];
  }
  return [
    '## Attachments',
    '',
    ...session.attachments.map((attachment) => `- ${attachment.name} (${attachment.mimeType}, ${attachment.sizeBytes} bytes)`),
    '',
  ];
}

function messageMarkdown(message: ChatMessage): string[] {
  const role = titleCase(message.role);
  const usage = message.usage ? `, ${message.usage.totalTokens} tokens` : '';
  return [
    `## ${role}`,
    '',
    `> ${message.createdAt}${message.modelId ? `, ${message.modelId}` : ''}${usage}`,
    '',
    redactSensitiveText(message.content.map(contentToText).filter(Boolean).join('\n\n')),
    '',
  ];
}

function contentToText(content: MessageContent): string {
  if (content.type === 'text' || content.type === 'reasoning') return content.text;
  if (content.type === 'image') return `[image: ${content.fileId}, ${content.mimeType}]`;
  if (content.type === 'file') return `[file: ${content.name}, ${content.mimeType}]`;
  if (content.type === 'citation') return `[citation: ${content.label}]`;
  if (content.type === 'tool-call') return `[tool-call: ${content.name}]`;
  if (content.type === 'tool-result') return `[tool-result: ${content.toolCallId}]`;
  return '';
}

function stripProviderSecretRef(provider: ProviderConnection): Omit<ProviderConnection, 'apiKeyRef'> {
  const { apiKeyRef: _apiKeyRef, ...safeProvider } = provider;
  return safeProvider;
}

function chatGptConversationToSession(raw: unknown, index: number, options: ImportOptions): ChatSession {
  const conversation = isRecord(raw) ? raw : {};
  const importedAt = options.importedAt ?? new Date().toISOString();
  const nodes = isRecord(conversation.mapping) ? Object.entries(conversation.mapping) : [];
  const messages = nodes
    .map(([nodeId, node]) => chatGptNodeToMessage(nodeId, node, importedAt))
    .filter((message): message is ChatMessage => Boolean(message))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const createdAt = timestampFromSeconds(conversation.create_time) ?? messages[0]?.createdAt ?? importedAt;
  return {
    id: String(conversation.id ?? `chatgpt:${index + 1}`),
    title: String(conversation.title ?? 'Imported ChatGPT chat'),
    messages,
    tags: ['imported', 'chatgpt'],
    createdAt,
    updatedAt: timestampFromSeconds(conversation.update_time) ?? messages.at(-1)?.updatedAt ?? importedAt,
    syncState: 'dirty',
  };
}

function chatGptNodeToMessage(nodeId: string, raw: unknown, fallbackTimestamp: string): ChatMessage | undefined {
  const node = isRecord(raw) ? raw : {};
  const message = isRecord(node.message) ? node.message : undefined;
  const author = isRecord(message?.author) ? message.author : {};
  const role = normalizeRole(author.role);
  const text = chatGptContentText(message?.content);
  if (!role || !text) return undefined;
  const timestamp = timestampFromSeconds(message?.create_time ?? node.create_time) ?? fallbackTimestamp;
  return {
    id: String(message?.id ?? nodeId),
    role,
    content: [{ type: 'text', text }],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function openWebUiChatToSession(raw: unknown, index: number, options: ImportOptions): ChatSession {
  const chat = isRecord(raw) ? raw : {};
  const importedAt = options.importedAt ?? new Date().toISOString();
  const messages = extractOpenWebUiMessages(chat).map((message, messageIndex) => {
    const timestamp = openWebUiTimestamp(message.created_at ?? message.timestamp ?? message.updated_at) ?? importedAt;
    return {
      id: String(message.id ?? `owui:${index + 1}:${messageIndex + 1}`),
      role: normalizeRole(message.role) ?? 'user',
      content: [{ type: 'text', text: contentString(message.content) }],
      createdAt: timestamp,
      updatedAt: timestamp,
    } satisfies ChatMessage;
  }).filter((message) => contentString(message.content[0]).trim());
  return {
    id: String(chat.id ?? `open-webui:${index + 1}`),
    title: String(chat.title ?? 'Imported Open WebUI chat'),
    messages,
    tags: ['imported', 'open-webui'],
    createdAt: openWebUiTimestamp(chat.created_at) ?? messages[0]?.createdAt ?? importedAt,
    updatedAt: openWebUiTimestamp(chat.updated_at) ?? messages.at(-1)?.updatedAt ?? importedAt,
    syncState: 'dirty',
  };
}

function extractOpenWebUiMessages(chat: Record<string, unknown>): Record<string, unknown>[] {
  if (isRecord(chat.chat) && Array.isArray(chat.chat.messages)) return chat.chat.messages.filter(isRecord);
  if (Array.isArray(chat.messages)) return chat.messages.filter(isRecord);
  if (isRecord(chat.chat) && isRecord(chat.chat.history) && isRecord(chat.chat.history.messages)) {
    return Object.values(chat.chat.history.messages).filter(isRecord);
  }
  return [];
}

function chatGptContentText(raw: unknown): string {
  const content = isRecord(raw) ? raw : {};
  if (Array.isArray(content.parts)) {
    return content.parts.map(contentString).filter(Boolean).join('\n');
  }
  return contentString(content.text);
}

function contentString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(contentString).filter(Boolean).join('\n');
  if (isRecord(value) && typeof value.text === 'string') return value.text;
  return '';
}

function normalizeRole(value: unknown): ChatMessage['role'] | undefined {
  if (value === 'user' || value === 'assistant' || value === 'system' || value === 'tool') return value;
  return undefined;
}

function timestampFromSeconds(value: unknown): string | undefined {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : undefined;
}

function openWebUiTimestamp(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  return timestampFromSeconds(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function titleCase(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
