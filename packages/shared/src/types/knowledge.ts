export type KnowledgeScope = 'session' | 'library';

export type KnowledgePage = {
  pageNumber: number;
  text: string;
};

export type KnowledgeDocument = {
  id: string;
  title: string;
  scope: KnowledgeScope;
  sourceFileId?: string;
  mimeType?: string;
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
};

export type KnowledgeSearchResult = {
  chunk: KnowledgeChunk;
  score: number;
  citationLabel: string;
};

export type KnowledgeBaseState = {
  documents: KnowledgeDocument[];
  chunks: KnowledgeChunk[];
};
