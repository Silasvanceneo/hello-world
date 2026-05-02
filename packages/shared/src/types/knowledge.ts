import type { SupportedFileKind } from './file.ts';

export type KnowledgeScope = 'session' | 'library';

export type KnowledgeIngestionStatus =
  | 'queued'
  | 'parse'
  | 'chunk'
  | 'embed'
  | 'index'
  | 'indexed'
  | 'skipped'
  | 'failed'
  | 'retry';

export type KnowledgeIngestionSourceKind = Extract<
  SupportedFileKind,
  'text' | 'markdown' | 'pdf' | 'docx' | 'xlsx' | 'html' | 'url' | 'sitemap' | 'directory'
>;

export type KnowledgePage = {
  pageNumber: number;
  text: string;
};

export type KnowledgeSitemapEntry = {
  url: string;
  title?: string;
  text?: string;
  html?: string;
};

export type KnowledgeIngestionSource = {
  id: string;
  kind: KnowledgeIngestionSourceKind;
  title: string;
  mimeType?: string;
  text?: string;
  html?: string;
  url?: string;
  pages?: KnowledgePage[];
  entries?: KnowledgeSitemapEntry[];
  contentHash?: string;
  createdAt: string;
};

export type KnowledgeIngestionHistoryEntry = {
  status: KnowledgeIngestionStatus;
  at: string;
  message?: string;
};

export type KnowledgeIngestionJob = {
  id: string;
  sourceId: string;
  status: KnowledgeIngestionStatus;
  attempts: number;
  error?: string;
  duplicateOf?: string;
  createdAt: string;
  updatedAt: string;
  history: KnowledgeIngestionHistoryEntry[];
};

export type KnowledgeDocument = {
  id: string;
  title: string;
  scope: KnowledgeScope;
  kind?: KnowledgeIngestionSourceKind;
  sourceFileId?: string;
  sourceUri?: string;
  mimeType?: string;
  contentHash?: string;
  pipeline?: Array<'parse' | 'chunk' | 'embed' | 'index'>;
  text: string;
  pages?: KnowledgePage[];
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeChunk = {
  id: string;
  documentId: string;
  title: string;
  scope: KnowledgeScope;
  text: string;
  ordinal: number;
  pageNumber?: number;
  sourceKind?: KnowledgeIngestionSourceKind;
  sourceUri?: string;
  contentHash?: string;
};

export type KnowledgeEmbedding = {
  providerId: string;
  dimensions: number;
  values: number[];
};

export type KnowledgeVectorIndexMode = 'web-memory' | 'mobile-memory' | 'desktop-durable';

export type KnowledgeVectorIndexItem = {
  chunkId: string;
  documentId: string;
  embedding: KnowledgeEmbedding;
};

export type KnowledgeVectorIndex = {
  mode: KnowledgeVectorIndexMode;
  items: KnowledgeVectorIndexItem[];
};

export type KnowledgeSearchResult = {
  chunk: KnowledgeChunk;
  score: number;
  citationLabel: string;
  lexicalScore?: number;
  vectorScore?: number;
};

export type RagEvalCase = {
  id: string;
  query: string;
  expectedDocumentIds?: string[];
  expectedCitationLabels?: string[];
  expectedNoAnswer?: boolean;
};

export type RagEvalCaseResult = {
  id: string;
  hit: boolean;
  citationAccurate: boolean;
  noAnswer: boolean;
  topCitationLabels: string[];
};

export type RagEvalReport = {
  total: number;
  hitRate: number;
  citationAccuracy: number;
  noAnswerAccuracy: number;
  cases: RagEvalCaseResult[];
};

export type KnowledgeBaseState = {
  documents: KnowledgeDocument[];
  chunks: KnowledgeChunk[];
  ingestion: {
    sources: KnowledgeIngestionSource[];
    jobs: KnowledgeIngestionJob[];
  };
};
