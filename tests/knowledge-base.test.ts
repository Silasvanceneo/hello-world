import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChatFileAttachment, KnowledgeDocument } from '@hello-world/shared';
import {
  addKnowledgeDocument,
  buildCitationContext,
  createKnowledgeBaseState,
  createKnowledgeDocumentsFromAttachments,
  promoteKnowledgeDocument,
  searchKnowledge,
} from '../packages/core/src/knowledge/knowledge-base.ts';

test('session attachments can become searchable temporary knowledge', () => {
  const attachments: ChatFileAttachment[] = [
    {
      id: 'file-1',
      kind: 'markdown',
      name: 'guide.md',
      mimeType: 'text/markdown',
      sizeBytes: 24,
      text: 'Alpha project setup notes',
      createdAt: '2026-04-29T00:00:00.000Z',
    },
  ];
  const [document] = createKnowledgeDocumentsFromAttachments(attachments, 'session', '2026-04-29T00:00:00.000Z');
  const state = addKnowledgeDocument(createKnowledgeBaseState(), document);
  const results = searchKnowledge(state, 'project setup');

  assert.equal(results.length, 1);
  assert.equal(results[0]?.chunk.scope, 'session');
  assert.match(buildCitationContext(results), /\[guide.md#1\]/);
});

test('PDF page text becomes page-aware citations', () => {
  const attachment: ChatFileAttachment = {
    id: 'pdf-1',
    kind: 'pdf',
    name: 'manual.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 100,
    text: 'Install steps\nTroubleshooting proxy',
    pageTexts: [
      { pageNumber: 1, text: 'Install steps' },
      { pageNumber: 2, text: 'Troubleshooting proxy' },
    ],
    createdAt: '2026-04-29T00:00:00.000Z',
  };
  const [document] = createKnowledgeDocumentsFromAttachments([attachment], 'library', '2026-04-29T00:00:00.000Z');
  const state = addKnowledgeDocument(createKnowledgeBaseState(), document);
  const results = searchKnowledge(state, 'proxy');

  assert.equal(results[0]?.citationLabel, 'manual.pdf p.2');
  assert.match(buildCitationContext(results), /\[manual.pdf p\.2\]/);
});

test('temporary knowledge can be promoted to long-term library scope immutably', () => {
  const document: KnowledgeDocument = {
    id: 'doc-1',
    title: 'notes.txt',
    scope: 'session',
    text: 'Reusable routing notes',
    createdAt: '2026-04-29T00:00:00.000Z',
    updatedAt: '2026-04-29T00:00:00.000Z',
  };
  const initial = addKnowledgeDocument(createKnowledgeBaseState(), document);
  const promoted = promoteKnowledgeDocument(initial, 'doc-1', '2026-04-29T01:00:00.000Z');

  assert.equal(initial.documents[0]?.scope, 'session');
  assert.equal(promoted.documents[0]?.scope, 'library');
  assert.equal(searchKnowledge(promoted, 'routing', { scope: 'library' }).length, 1);
});
