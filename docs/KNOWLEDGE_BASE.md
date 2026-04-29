# File Knowledge Base

P1-M3 adds a dependency-free foundation for session knowledge and long-term local library knowledge.

## Scope

- Session attachments can become temporary searchable knowledge.
- Temporary knowledge can be promoted to long-term `library` scope.
- TXT, Markdown, PDF, DOCX, and XLSX can provide extracted text for retrieval.
- PDF text extraction preserves basic page references when page objects are detectable.
- OCR remains optional and is not enabled without an explicit OCR dependency/toolchain.

## Retrieval model

`packages/core/src/knowledge/knowledge-base.ts` stores documents and derived chunks immutably:

- `createKnowledgeDocumentsFromAttachments` converts parsed attachments into knowledge documents.
- `addKnowledgeDocument` chunks and indexes a document.
- `searchKnowledge` performs lightweight local lexical search.
- `buildCitationContext` produces source-labelled context such as `[manual.pdf p.2] ...`.

This is intentionally simple and local-first. Vector search, folder watchers, OCR, and sync are reserved for later milestones.

## Web MVP

The Web shell now accepts drag-and-drop files onto the message panel and records DOCX/XLSX attachment metadata. Full browser-side Office parsing is deferred until a browser-safe parser is selected.
