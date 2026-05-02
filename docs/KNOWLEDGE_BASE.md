# File Knowledge Base

P1-M3 adds a dependency-free foundation for session knowledge and long-term local library knowledge.

## Scope

- Session attachments can become temporary searchable knowledge.
- Temporary knowledge can be promoted to long-term `library` scope.
- TXT, Markdown, PDF, DOCX, and XLSX can provide extracted text for retrieval.
- P6 ingestion now tracks TXT, Markdown, PDF, DOCX, XLSX, HTML, URL, and sitemap sources through queued, parse, chunk, embed, index, indexed, skipped, failed, and retry states.
- Content hashes deduplicate unchanged sources before repeat indexing work.
- P6 retrieval now includes a deterministic local embedding provider, lightweight Web/Mobile vector indexes, a Desktop durable index mode, hybrid lexical/vector search, metadata filters, reranking hooks, and RAG eval metrics.
- PDF text extraction preserves basic page references when page objects are detectable.
- OCR remains optional and is not enabled without an explicit OCR dependency/toolchain.

## Retrieval model

`packages/core/src/knowledge/knowledge-base.ts` stores documents and derived chunks immutably:

- `createKnowledgeDocumentsFromAttachments` converts parsed attachments into knowledge documents.
- `addKnowledgeDocument` chunks and indexes a document.
- `addKnowledgeIngestionSource` records a source and creates an ingestion job.
- `createKnowledgeIngestionDocument` normalizes HTML, URL, sitemap, and parsed file sources into citation-ready documents.
- `retryKnowledgeIngestionJob` and `failKnowledgeIngestionJob` keep ingestion failures explicit and recoverable.
- `searchKnowledge` performs lightweight local lexical search.
- `createLocalEmbeddingProvider` produces deterministic local embeddings for tests and offline retrieval.
- `indexKnowledgeChunks` builds a local vector index over chunk text.
- `hybridSearchKnowledge` combines lexical and vector scores with metadata filters and optional reranking.
- `evaluateRagRetrieval` measures hit rate, citation accuracy, and no-answer accuracy.
- `buildCitationContext` produces source-labelled context such as `[manual.pdf p.2] ...`.

This remains local-first. The current embedding provider is deterministic and dependency-free; remote embedding models can plug into the same provider interface later without changing retrieval tests.

## Web MVP

The Web shell now accepts drag-and-drop files onto the message panel and records DOCX/XLSX attachment metadata. `apps/web/src/knowledge-ingestion.js` exposes a shared ingestion status view model for Web, Desktop, and Mobile. Desktop is the only platform that advertises directory import; Web and Mobile expose the shared safe source subset.
