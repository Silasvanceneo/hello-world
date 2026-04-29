import type { ChatFileAttachment, ChatSession, FileParseResult, ModelCapability, SupportedFileKind } from '@hello-world/shared';

export type FileInput = {
  name: string;
  mimeType: string;
  data: string | Uint8Array;
};

export type FileInputContext = {
  now?: () => string;
  createId?: () => string;
  maxSizeBytes?: number;
};

const DEFAULT_MAX_SIZE_BYTES = 10 * 1024 * 1024;

export function parseFileInput(input: FileInput, context: FileInputContext = {}): FileParseResult {
  const bytes = toBytes(input.data);
  const maxSizeBytes = context.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES;
  if (bytes.byteLength > maxSizeBytes) {
    return { ok: false, reason: 'too_large', message: `File is larger than ${maxSizeBytes} bytes.` };
  }

  const kind = detectFileKind(input.name, input.mimeType);
  if (kind === 'unsupported') {
    return { ok: false, reason: 'unsupported_type', message: `Unsupported file type: ${input.mimeType || input.name}` };
  }

  try {
    const timestamp = context.now?.() ?? new Date().toISOString();
    const id = context.createId?.() ?? crypto.randomUUID();
    const base = { id, kind, name: input.name, mimeType: input.mimeType, sizeBytes: bytes.byteLength, createdAt: timestamp };

    if (kind === 'image') {
      return { ok: true, attachment: { ...base, dataUrl: toDataUrl(input.mimeType, bytes) } };
    }

    if (kind === 'pdf') {
      return { ok: true, attachment: { ...base, text: extractBasicPdfText(bytes) } };
    }

    return { ok: true, attachment: { ...base, text: decodeUtf8(bytes) } };
  } catch (error) {
    return { ok: false, reason: 'parse_error', message: error instanceof Error ? error.message : 'Unable to parse file.' };
  }
}

export function attachFileToSession(session: ChatSession, attachment: ChatFileAttachment, updatedAt: string): ChatSession {
  return {
    ...session,
    attachments: [...(session.attachments ?? []), attachment],
    updatedAt,
    syncState: 'dirty',
  };
}

export function removeFileFromSession(session: ChatSession, fileId: string, updatedAt: string): ChatSession {
  return {
    ...session,
    attachments: (session.attachments ?? []).filter((attachment) => attachment.id !== fileId),
    messages: session.messages.map((message) => ({
      ...message,
      content: message.content.filter((content) => !('fileId' in content) || content.fileId !== fileId),
    })),
    updatedAt,
    syncState: 'dirty',
  };
}

export function describeUnsupportedFileForModel(capability: ModelCapability, attachment: ChatFileAttachment): string | undefined {
  if (attachment.kind === 'image' && !capability.supportsVision) {
    return 'The selected model does not support image input. Choose a vision model or remove the image.';
  }

  if ((attachment.kind === 'pdf' || attachment.kind === 'text' || attachment.kind === 'markdown') && !capability.supportsFiles) {
    return 'The selected model does not support file input. The client can paste extracted text as context instead.';
  }

  return undefined;
}

export function detectFileKind(name: string, mimeType: string): SupportedFileKind {
  const lowerName = name.toLowerCase();
  const lowerMime = mimeType.toLowerCase();

  if (lowerMime.startsWith('image/') && ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(lowerMime)) {
    return 'image';
  }
  if (lowerMime === 'application/pdf' || lowerName.endsWith('.pdf')) {
    return 'pdf';
  }
  if (lowerMime === 'text/markdown' || lowerName.endsWith('.md') || lowerName.endsWith('.markdown')) {
    return 'markdown';
  }
  if (lowerMime.startsWith('text/') || lowerName.endsWith('.txt')) {
    return 'text';
  }

  return 'unsupported';
}

function toBytes(data: string | Uint8Array): Uint8Array {
  return typeof data === 'string' ? new TextEncoder().encode(data) : data;
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

function toDataUrl(mimeType: string, bytes: Uint8Array): string {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return `data:${mimeType};base64,${btoa(binary)}`;
}

export function extractBasicPdfText(bytes: Uint8Array): string {
  const raw = new TextDecoder('latin1', { fatal: false }).decode(bytes);
  const textMatches = [...raw.matchAll(/\(([^()]*)\)\s*Tj/g)].map((match) => unescapePdfText(match[1] ?? ''));
  const arrayMatches = [...raw.matchAll(/\[((?:\([^()]*\)\s*)+)\]\s*TJ/g)]
    .flatMap((match) => [...(match[1] ?? '').matchAll(/\(([^()]*)\)/g)].map((inner) => unescapePdfText(inner[1] ?? '')));
  return [...textMatches, ...arrayMatches].join('\n').trim();
}

function unescapePdfText(text: string): string {
  return text
    .replaceAll('\\(', '(')
    .replaceAll('\\)', ')')
    .replaceAll('\\n', '\n')
    .replaceAll('\\r', '\n')
    .replaceAll('\\t', '\t')
    .replaceAll('\\\\', '\\');
}
