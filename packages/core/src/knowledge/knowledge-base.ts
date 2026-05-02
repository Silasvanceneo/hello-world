import type {
  ChatFileAttachment,
  KnowledgeBaseState,
  KnowledgeChunk,
  KnowledgeDocument,
  KnowledgeEmbedding,
  KnowledgeIngestionJob,
  KnowledgeIngestionSource,
  KnowledgeIngestionSourceKind,
  KnowledgeIngestionStatus,
  KnowledgeScope,
  KnowledgeSearchResult,
  KnowledgeVectorIndex,
  KnowledgeVectorIndexMode,
  RagEvalCase,
  RagEvalReport,
} from '@hello-world/shared';

export type KnowledgeChunkingOptions = {
  chunkSize?: number;
  overlap?: number;
};

export type KnowledgeSearchOptions = {
  scope?: KnowledgeScope;
  limit?: number;
};

export type KnowledgeEmbeddingProvider = {
  id: string;
  dimensions: number;
  embed(texts: string[]): Promise<KnowledgeEmbedding[]>;
};

export type HybridKnowledgeSearchOptions = KnowledgeSearchOptions & {
  vectorIndex?: KnowledgeVectorIndex;
  embeddingProvider?: KnowledgeEmbeddingProvider;
  metadata?: {
    sourceKind?: KnowledgeIngestionSourceKind;
    sourceUri?: string;
    documentIds?: string[];
  };
  lexicalWeight?: number;
  vectorWeight?: number;
  noAnswerThreshold?: number;
  rerank?: (results: KnowledgeSearchResult[]) => KnowledgeSearchResult[];
};

export type RagEvaluationOptions = {
  embeddingProvider: KnowledgeEmbeddingProvider;
  vectorIndex: KnowledgeVectorIndex;
  limit?: number;
  noAnswerThreshold?: number;
};

export type KnowledgeIngestionContext = {
  now?: () => string;
  createId?: () => string;
};

export type KnowledgePlatform = 'web' | 'desktop' | 'mobile';

const DEFAULT_CHUNK_SIZE = 900;
const DEFAULT_OVERLAP = 120;
const INGESTION_PIPELINE = ['parse', 'chunk', 'embed', 'index'] as const;

export function createKnowledgeBaseState(): KnowledgeBaseState {
  return { documents: [], chunks: [], ingestion: { sources: [], jobs: [] } };
}

export function createLocalEmbeddingProvider({ dimensions = 32, id = 'local-hash-embedding' } = {}): KnowledgeEmbeddingProvider {
  return {
    id,
    dimensions,
    async embed(texts: string[]) {
      return texts.map((text) => ({
        providerId: id,
        dimensions,
        values: normalizeVector(hashTextToVector(text, dimensions)),
      }));
    },
  };
}

export function createVectorIndex(mode: KnowledgeVectorIndexMode = 'web-memory'): KnowledgeVectorIndex {
  return { mode, items: [] };
}

export async function indexKnowledgeChunks(
  index: KnowledgeVectorIndex,
  chunks: KnowledgeChunk[],
  provider: KnowledgeEmbeddingProvider,
): Promise<KnowledgeVectorIndex> {
  const embeddings = await provider.embed(chunks.map((chunk) => `${chunk.title}\n${chunk.text}`));
  return {
    mode: index.mode,
    items: chunks.map((chunk, index) => ({
      chunkId: chunk.id,
      documentId: chunk.documentId,
      embedding: embeddings[index],
    })),
  };
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
      kind: attachment.kind === 'unsupported' || attachment.kind === 'image' ? undefined : attachment.kind,
      sourceFileId: attachment.id,
      mimeType: attachment.mimeType,
      text: attachment.text?.trim() ?? '',
      pages: attachment.pageTexts?.filter((page) => page.text.trim()),
      contentHash: contentHash(attachment.text?.trim() ?? ''),
      pipeline: [...INGESTION_PIPELINE],
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
}

export function addKnowledgeIngestionSource(
  state: KnowledgeBaseState,
  source: KnowledgeIngestionSource,
  context: KnowledgeIngestionContext = {},
): KnowledgeBaseState {
  const timestamp = context.now?.() ?? new Date().toISOString();
  const normalizedSource = normalizeKnowledgeIngestionSource(source);
  const duplicate = state.ingestion.sources.find((item) => item.contentHash === normalizedSource.contentHash);
  const job: KnowledgeIngestionJob = duplicate
    ? {
      id: context.createId?.() ?? `ingest:${normalizedSource.id}`,
      sourceId: normalizedSource.id,
      status: 'skipped',
      attempts: 1,
      duplicateOf: duplicate.id,
      createdAt: timestamp,
      updatedAt: timestamp,
      history: [
        { status: 'queued', at: timestamp },
        { status: 'skipped', at: timestamp, message: `Duplicate of ${duplicate.id}` },
      ],
    }
    : {
      id: context.createId?.() ?? `ingest:${normalizedSource.id}`,
      sourceId: normalizedSource.id,
      status: 'parse',
      attempts: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      history: [
        { status: 'queued', at: timestamp },
        { status: 'parse', at: timestamp },
      ],
    };

  return {
    ...state,
    ingestion: {
      sources: [normalizedSource, ...state.ingestion.sources],
      jobs: [job, ...state.ingestion.jobs],
    },
  };
}

export function failKnowledgeIngestionJob(
  state: KnowledgeBaseState,
  jobId: string,
  error: string,
  timestamp = new Date().toISOString(),
): KnowledgeBaseState {
  return updateIngestionJob(state, jobId, (job) => ({
    ...job,
    status: 'failed',
    error,
    updatedAt: timestamp,
    history: [...job.history, { status: 'failed', at: timestamp, message: error }],
  }));
}

export function retryKnowledgeIngestionJob(
  state: KnowledgeBaseState,
  jobId: string,
  timestamp = new Date().toISOString(),
): KnowledgeBaseState {
  return updateIngestionJob(state, jobId, (job) => ({
    ...job,
    status: 'retry',
    error: undefined,
    attempts: job.attempts + 1,
    updatedAt: timestamp,
    history: [...job.history, { status: 'retry', at: timestamp }],
  }));
}

export function createKnowledgeIngestionDocument(
  job: Pick<KnowledgeIngestionJob, 'id' | 'sourceId'>,
  source: KnowledgeIngestionSource,
  timestamp = new Date().toISOString(),
): KnowledgeDocument[] {
  const normalizedSource = normalizeKnowledgeIngestionSource(source);
  if (normalizedSource.kind === 'sitemap') {
    return (normalizedSource.entries ?? []).map((entry, index) => {
      const text = normalizeSourceText({
        id: `${normalizedSource.id}:${index + 1}`,
        kind: 'url',
        title: entry.title ?? entry.url,
        url: entry.url,
        text: entry.text,
        html: entry.html,
        createdAt: normalizedSource.createdAt,
      });
      return documentFromSource({
        id: `${job.id}:document:${index + 1}`,
        title: entry.title ?? entry.url,
        kind: 'url',
        text,
        sourceUri: sanitizeSourceUri(entry.url),
        mimeType: 'text/html',
        contentHash: contentHash(`${entry.url}\n${text}`),
        timestamp,
      });
    }).filter((document) => document.text);
  }

  const text = normalizeSourceText(normalizedSource);
  return text
    ? [documentFromSource({
      id: `${job.id}:document`,
      title: normalizedSource.title,
      kind: normalizedSource.kind,
      text,
      sourceUri: sanitizeSourceUri(normalizedSource.url),
      mimeType: normalizedSource.mimeType,
      pages: normalizedSource.pages,
      contentHash: normalizedSource.contentHash,
      timestamp,
    })]
    : [];
}

export function addKnowledgeDocument(
  state: KnowledgeBaseState,
  document: KnowledgeDocument,
  options: KnowledgeChunkingOptions = {},
): KnowledgeBaseState {
  const chunks = chunkKnowledgeDocument(document, options);
  return {
    ...state,
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
  return addKnowledgeDocument(state, promoted);
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

export async function hybridSearchKnowledge(
  state: KnowledgeBaseState,
  query: string,
  options: HybridKnowledgeSearchOptions = {},
): Promise<KnowledgeSearchResult[]> {
  const terms = tokenize(query);
  if (terms.length === 0) {
    return [];
  }

  const limit = options.limit ?? 5;
  const lexicalWeight = options.lexicalWeight ?? 0.55;
  const vectorWeight = options.vectorWeight ?? 0.45;
  const queryEmbedding = options.embeddingProvider ? (await options.embeddingProvider.embed([query]))[0] : undefined;
  const vectorScores = new Map<string, number>();

  if (queryEmbedding && options.vectorIndex) {
    for (const item of options.vectorIndex.items) {
      vectorScores.set(item.chunkId, cosineSimilarity(queryEmbedding.values, item.embedding.values));
    }
  }

  const maxLexical = Math.max(1, ...state.chunks.map((chunk) => scoreChunk(chunk, terms)));
  const results = state.chunks
    .filter((chunk) => !options.scope || chunk.scope === options.scope)
    .filter((chunk) => metadataMatches(chunk, options.metadata))
    .map((chunk) => {
      const lexicalScore = scoreChunk(chunk, terms) / maxLexical;
      const vectorScore = vectorScores.get(chunk.id) ?? 0;
      return {
        chunk,
        lexicalScore,
        vectorScore,
        score: lexicalScore * lexicalWeight + vectorScore * vectorWeight,
        citationLabel: citationLabel(chunk),
      };
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.chunk.ordinal - right.chunk.ordinal);

  const ranked = options.rerank ? options.rerank(results) : results;
  const filtered = options.noAnswerThreshold === undefined
    ? ranked
    : ranked.filter((result) => result.score >= options.noAnswerThreshold);
  return filtered.slice(0, limit);
}

export async function evaluateRagRetrieval(
  state: KnowledgeBaseState,
  cases: RagEvalCase[],
  options: RagEvaluationOptions,
): Promise<RagEvalReport> {
  const results = await Promise.all(cases.map(async (item) => {
    const retrieved = await hybridSearchKnowledge(state, item.query, {
      embeddingProvider: options.embeddingProvider,
      vectorIndex: options.vectorIndex,
      limit: options.limit ?? 5,
      noAnswerThreshold: item.expectedNoAnswer ? options.noAnswerThreshold : undefined,
    });
    const documentIds = new Set(retrieved.map((result) => result.chunk.documentId));
    const citationLabels = retrieved.map((result) => result.citationLabel);
    const hit = item.expectedNoAnswer
      ? retrieved.length === 0
      : (item.expectedDocumentIds ?? []).some((id) => documentIds.has(id));
    const citationAccurate = item.expectedNoAnswer
      ? retrieved.length === 0
      : (item.expectedCitationLabels ?? []).every((label) => citationLabels.includes(label));
    return {
      id: item.id,
      hit,
      citationAccurate,
      noAnswer: retrieved.length === 0,
      topCitationLabels: citationLabels,
    };
  }));

  const total = Math.max(cases.length, 1);
  const noAnswerCases = cases.filter((item) => item.expectedNoAnswer).length;
  const noAnswerCorrect = results.filter((result, index) => cases[index]?.expectedNoAnswer && result.noAnswer).length;
  return {
    total: cases.length,
    hitRate: roundMetric(results.filter((result) => result.hit).length / total),
    citationAccuracy: roundMetric(results.filter((result) => result.citationAccurate).length / total),
    noAnswerAccuracy: noAnswerCases === 0 ? 1 : roundMetric(noAnswerCorrect / noAnswerCases),
    cases: results,
  };
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
    sourceKind: document.kind,
    sourceUri: document.sourceUri,
    contentHash: document.contentHash,
  })));
}

export function describeKnowledgeIngestionPlatform(platform: KnowledgePlatform): {
  platform: KnowledgePlatform;
  supportedSources: KnowledgeIngestionSourceKind[];
  directoryImport: 'supported' | 'unsupported';
  statusText: string;
} {
  const shared: KnowledgeIngestionSourceKind[] = ['text', 'markdown', 'pdf', 'docx', 'xlsx', 'html', 'url', 'sitemap'];
  const supportedSources = platform === 'desktop' ? [...shared, 'directory'] : shared;
  const directoryImport = platform === 'desktop' ? 'supported' : 'unsupported';
  return {
    platform,
    supportedSources,
    directoryImport,
    statusText: `${platform} ingestion supports ${supportedSources.join(', ')}.`,
  };
}

function normalizeKnowledgeIngestionSource(source: KnowledgeIngestionSource): KnowledgeIngestionSource {
  const text = normalizeSourceText(source);
  const hashInput = source.kind === 'sitemap'
    ? JSON.stringify(source.entries?.map((entry) => [entry.url, entry.title, entry.text, htmlToText(entry.html ?? '')]) ?? [])
    : `${source.kind}\n${source.url ?? ''}\n${text}`;
  return {
    ...source,
    title: source.title.trim() || source.url || source.id,
    text: source.text?.trim() || undefined,
    html: source.html?.trim() || undefined,
    url: sanitizeSourceUri(source.url),
    pages: source.pages?.filter((page) => page.text.trim()),
    contentHash: source.contentHash ?? contentHash(hashInput),
  };
}

function documentFromSource(input: {
  id: string;
  title: string;
  kind: KnowledgeIngestionSourceKind;
  text: string;
  timestamp: string;
  sourceUri?: string;
  mimeType?: string;
  pages?: Array<{ pageNumber: number; text: string }>;
  contentHash?: string;
}): KnowledgeDocument {
  return {
    id: input.id,
    title: input.title,
    scope: 'library',
    kind: input.kind,
    sourceUri: input.sourceUri,
    mimeType: input.mimeType,
    text: input.text,
    pages: input.pages?.filter((page) => page.text.trim()),
    contentHash: input.contentHash ?? contentHash(input.text),
    pipeline: [...INGESTION_PIPELINE],
    createdAt: input.timestamp,
    updatedAt: input.timestamp,
  };
}

function normalizeSourceText(source: KnowledgeIngestionSource): string {
  if (source.html) {
    return htmlToText(source.html);
  }
  if (source.pages?.length) {
    return source.pages.map((page) => page.text.trim()).filter(Boolean).join('\n');
  }
  return source.text?.trim() ?? '';
}

function htmlToText(html: string): string {
  return decodeHtmlEntities(html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function decodeHtmlEntities(text: string): string {
  return text
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#039;', "'")
    .replaceAll('&apos;', "'");
}

function sanitizeSourceUri(uri?: string): string | undefined {
  if (!uri) return undefined;
  try {
    const url = new URL(uri);
    url.username = '';
    url.password = '';
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/token|key|secret|password/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    return url.toString().replace(/\?$/, '');
  } catch {
    return uri.trim() || undefined;
  }
}

function updateIngestionJob(
  state: KnowledgeBaseState,
  jobId: string,
  update: (job: KnowledgeIngestionJob) => KnowledgeIngestionJob,
): KnowledgeBaseState {
  return {
    ...state,
    ingestion: {
      ...state.ingestion,
      jobs: state.ingestion.jobs.map((job) => job.id === jobId ? update(job) : job),
    },
  };
}

export function contentHash(value: string): string {
  let hash = 0x811c9dc5;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`;
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

function metadataMatches(
  chunk: KnowledgeChunk,
  metadata?: HybridKnowledgeSearchOptions['metadata'],
): boolean {
  if (!metadata) {
    return true;
  }
  if (metadata.sourceKind && chunk.sourceKind !== metadata.sourceKind) {
    return false;
  }
  if (metadata.sourceUri && chunk.sourceUri !== metadata.sourceUri) {
    return false;
  }
  if (metadata.documentIds && !metadata.documentIds.includes(chunk.documentId)) {
    return false;
  }
  return true;
}

function hashTextToVector(text: string, dimensions: number): number[] {
  const vector = Array.from({ length: dimensions }, () => 0);
  for (const token of tokenize(text)) {
    const hash = numericHash(token);
    const index = Math.abs(hash) % dimensions;
    vector[index] += 1 + (token.length % 7) / 10;
  }
  return vector;
}

function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return magnitude === 0 ? vector : vector.map((value) => value / magnitude);
}

function cosineSimilarity(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  let score = 0;
  for (let index = 0; index < length; index += 1) {
    score += left[index] * right[index];
  }
  return score;
}

function numericHash(value: string): number {
  let hash = 0x811c9dc5;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash;
}

function roundMetric(value: number): number {
  return Number(value.toFixed(4));
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
