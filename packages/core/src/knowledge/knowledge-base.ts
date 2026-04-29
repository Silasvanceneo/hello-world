import type {
  ChatFileAttachment,
  KnowledgeBaseState,
  KnowledgeChunk,
  KnowledgeDocument,
  KnowledgeScope,
  KnowledgeSearchResult,
} from '@hello-world/shared';

export type KnowledgeChunkingOptions = {
  chunkSize?: number;
  overlap?: number;
};

export type KnowledgeSearchOptions = {
  scope?: KnowledgeScope;
  limit?: number;
};

const DEFAULT_CHUNK_SIZE = 900;
const DEFAULT_OVERLAP = 120;

export function createKnowledgeBaseState(): KnowledgeBaseState {
  return { documents: [], chunks: [] };
}

export function createKnowledgeDocumentsFromAttachments(
  attachments: ChatFileAttachment[],
  scope: KnowledgeScope,
  timestamp = new Date().toISOString(),
): KnowledgeDocument[] {
  return attachments
    .filter((attachment) => attachment.text?.trim())
    .map((attachment) => ({
      id: `knowledge:${attachment.id}`,
      title: attachment.name,
      scope,
      sourceFileId: attachment.id,
      mimeType: attachment.mimeType,
      text: attachment.text?.trim() ?? '',
      pages: attachment.pageTexts?.filter((page) => page.text.trim()),
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
}

export function addKnowledgeDocument(
  state: KnowledgeBaseState,
  document: KnowledgeDocument,
  options: KnowledgeChunkingOptions = {},
): KnowledgeBaseState {
  const chunks = chunkKnowledgeDocument(document, options);
  return {
    documents: [...state.documents.filter((item) => item.id !== document.id), document],
    chunks: [...state.chunks.filter((chunk) => chunk.documentId !== document.id), ...chunks],
  };
}

export function promoteKnowledgeDocument(
  state: KnowledgeBaseState,
  documentId: string,
  updatedAt = new Date().toISOString(),
): KnowledgeBaseState {
  const document = state.documents.find((item) => item.id === documentId);
  if (!document) {
    throw new Error(`Knowledge document not found: ${documentId}`);
  }
  const promoted: KnowledgeDocument = { ...document, scope: 'library', updatedAt };
  return addKnowledgeDocument({ documents: state.documents, chunks: state.chunks }, promoted);
}

export function searchKnowledge(
  state: KnowledgeBaseState,
  query: string,
  options: KnowledgeSearchOptions = {},
): KnowledgeSearchResult[] {
  const terms = tokenize(query);
  if (terms.length === 0) {
    return [];
  }
  const limit = options.limit ?? 5;
  return state.chunks
    .filter((chunk) => !options.scope || chunk.scope === options.scope)
    .map((chunk) => ({ chunk, score: scoreChunk(chunk, terms), citationLabel: citationLabel(chunk) }))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.chunk.ordinal - right.chunk.ordinal)
    .slice(0, limit);
}

export function buildCitationContext(results: KnowledgeSearchResult[]): string {
  return results
    .map((result) => `[${result.citationLabel}] ${result.chunk.text}`)
    .join('\n\n');
}

export function chunkKnowledgeDocument(
  document: KnowledgeDocument,
  options: KnowledgeChunkingOptions = {},
): KnowledgeChunk[] {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const overlap = options.overlap ?? DEFAULT_OVERLAP;
  const pages = document.pages?.length
    ? document.pages
    : [{ pageNumber: undefined, text: document.text }];
  let ordinal = 0;
  return pages.flatMap((page) => splitText(page.text, chunkSize, overlap).map((text) => ({
    id: `${document.id}:chunk:${++ordinal}`,
    documentId: document.id,
    title: document.title,
    scope: document.scope,
    text,
    ordinal,
    pageNumber: page.pageNumber,
  })));
}

function splitText(text: string, chunkSize: number, overlap: number): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return [];
  }
  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(normalized.length, start + chunkSize);
    chunks.push(normalized.slice(start, end).trim());
    if (end >= normalized.length) {
      break;
    }
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

function scoreChunk(chunk: KnowledgeChunk, terms: string[]): number {
  const text = `${chunk.title} ${chunk.text}`.toLowerCase();
  return terms.reduce((score, term) => score + occurrences(text, term), 0);
}

function citationLabel(chunk: KnowledgeChunk): string {
  return chunk.pageNumber ? `${chunk.title} p.${chunk.pageNumber}` : `${chunk.title}#${chunk.ordinal}`;
}

function tokenize(query: string): string[] {
  return [...new Set(query.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? [])];
}

function occurrences(value: string, term: string): number {
  return value.split(term).length - 1;
}
