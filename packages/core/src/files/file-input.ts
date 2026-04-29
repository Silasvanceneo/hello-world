import { inflateRawSync } from 'node:zlib';
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
      const pageTexts = extractBasicPdfPages(bytes);
      return { ok: true, attachment: { ...base, text: pageTexts.map((page) => page.text).join('\n').trim(), pageTexts } };
    }

    if (kind === 'docx') {
      return { ok: true, attachment: { ...base, text: extractBasicDocxText(bytes) } };
    }

    if (kind === 'xlsx') {
      return { ok: true, attachment: { ...base, text: extractBasicXlsxText(bytes) } };
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

  if (['pdf', 'text', 'markdown', 'docx', 'xlsx'].includes(attachment.kind) && !capability.supportsFiles) {
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
  if (lowerMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || lowerName.endsWith('.docx')) {
    return 'docx';
  }
  if (lowerMime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || lowerName.endsWith('.xlsx')) {
    return 'xlsx';
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
  return extractBasicPdfPages(bytes).map((page) => page.text).join('\n').trim();
}

export function extractBasicPdfPages(bytes: Uint8Array): Array<{ pageNumber: number; text: string }> {
  const raw = new TextDecoder('latin1', { fatal: false }).decode(bytes);
  const pageObjects = [...raw.matchAll(/\d+\s+\d+\s+obj[\s\S]*?endobj/g)]
    .map((match) => match[0])
    .filter((object) => /\/Type\s*\/Page\b/.test(object) && !/\/Type\s*\/Pages\b/.test(object));
  const rawPages = pageObjects.length > 0 ? pageObjects : [raw];
  return rawPages
    .map((page, index) => ({ pageNumber: index + 1, text: extractPdfTextFromRaw(page) }))
    .filter((page) => page.text.length > 0);
}

export function extractBasicDocxText(bytes: Uint8Array): string {
  const documentXml = extractZipText(bytes).get('word/document.xml');
  return documentXml ? xmlToText(documentXml) : '';
}

export function extractBasicXlsxText(bytes: Uint8Array): string {
  const entries = extractZipText(bytes);
  const sharedStrings = parseSharedStrings(entries.get('xl/sharedStrings.xml') ?? '');
  return [...entries.entries()]
    .filter(([name]) => name.startsWith('xl/worksheets/') && name.endsWith('.xml'))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, xml]) => parseWorksheet(xml, sharedStrings))
    .filter(Boolean)
    .join('\n');
}

function extractPdfTextFromRaw(raw: string): string {
  const textMatches = [...raw.matchAll(/\(([^()]*)\)\s*Tj/g)].map((match) => unescapePdfText(match[1] ?? ''));
  const arrayMatches = [...raw.matchAll(/\[((?:\([^()]*\)\s*)+)\]\s*TJ/g)]
    .flatMap((match) => [...(match[1] ?? '').matchAll(/\(([^()]*)\)/g)].map((inner) => unescapePdfText(inner[1] ?? '')));
  return [...textMatches, ...arrayMatches].join('\n').trim();
}

function extractZipText(bytes: Uint8Array): Map<string, string> {
  return new Map([...extractZipEntries(bytes).entries()].map(([name, data]) => [name, decodeUtf8(data)]));
}

function extractZipEntries(bytes: Uint8Array): Map<string, Uint8Array> {
  const entries = new Map<string, Uint8Array>();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  while (offset + 30 <= bytes.byteLength) {
    if (view.getUint32(offset, true) !== 0x04034b50) {
      offset += 1;
      continue;
    }
    const method = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.byteLength) {
      break;
    }
    const name = decodeUtf8(bytes.slice(nameStart, nameStart + nameLength));
    const compressed = bytes.slice(dataStart, dataEnd);
    if (method === 0) {
      entries.set(name, compressed);
    } else if (method === 8) {
      entries.set(name, inflateRawSync(compressed));
    }
    offset = dataEnd;
  }
  return entries;
}

function parseSharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si[\s\S]*?<\/si>/g)].map((match) => xmlToText(match[0]));
}

function parseWorksheet(xml: string, sharedStrings: string[]): string {
  return [...xml.matchAll(/<row[\s\S]*?<\/row>/g)]
    .map((row) => [...row[0].matchAll(/<c\b([^>]*)>[\s\S]*?<v>([\s\S]*?)<\/v>[\s\S]*?<\/c>/g)]
      .map((cell) => {
        const raw = decodeXmlEntities(cell[2] ?? '');
        return /\bt="s"/.test(cell[1] ?? '') ? sharedStrings[Number(raw)] ?? raw : raw;
      })
      .join('\t'))
    .filter(Boolean)
    .join('\n');
}

function xmlToText(xml: string): string {
  const text = xml
    .replace(/<\/(w:p|p|row)>/g, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decodeXmlEntities(text.split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n'));
}

function decodeXmlEntities(text: string): string {
  return text
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'");
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
