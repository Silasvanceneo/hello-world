import assert from 'node:assert/strict';
import test from 'node:test';
import type { KnowledgeIngestionSource } from '@hello-world/shared';
import {
  addKnowledgeDocument,
  addKnowledgeIngestionSource,
  createKnowledgeBaseState,
  createKnowledgeIngestionDocument,
  describeKnowledgeIngestionPlatform,
  failKnowledgeIngestionJob,
  retryKnowledgeIngestionJob,
} from '../packages/core/src/knowledge/knowledge-base.ts';

const timestamp = '2026-05-02T13:00:00.000Z';

function source(patch: Partial<KnowledgeIngestionSource> = {}): KnowledgeIngestionSource {
  return {
    id: patch.id ?? 'source-1',
    kind: patch.kind ?? 'text',
    title: patch.title ?? 'Notes',
    mimeType: patch.mimeType ?? 'text/plain',
    text: patch.text ?? 'Alpha setup notes',
    createdAt: patch.createdAt ?? timestamp,
    ...patch,
  };
}

test('knowledge ingestion queue tracks parse, chunk, embed, index, failed, and retry states', () => {
  let state = addKnowledgeIngestionSource(createKnowledgeBaseState(), source(), { now: () => timestamp });
  const job = state.ingestion.jobs[0];
  assert.equal(job?.status, 'parse');
  assert.equal(job?.history.map((entry) => entry.status).join('>'), 'queued>parse');

  const [document] = createKnowledgeIngestionDocument(job, source(), timestamp);
  state = failKnowledgeIngestionJob(state, job.id, 'Parser failed', '2026-05-02T13:01:00.000Z');
  assert.equal(state.ingestion.jobs[0]?.status, 'failed');
  assert.equal(state.ingestion.jobs[0]?.error, 'Parser failed');

  state = retryKnowledgeIngestionJob(state, job.id, '2026-05-02T13:02:00.000Z');
  assert.equal(state.ingestion.jobs[0]?.status, 'retry');
  assert.equal(state.ingestion.jobs[0]?.attempts, 2);
  assert.deepEqual(document?.pipeline, ['parse', 'chunk', 'embed', 'index']);
});

test('knowledge ingestion normalizes TXT Markdown PDF DOCX XLSX HTML URL and sitemap sources', () => {
  const sources: KnowledgeIngestionSource[] = [
    source({ id: 'txt', kind: 'text', title: 'notes.txt', text: 'plain text' }),
    source({ id: 'md', kind: 'markdown', title: 'readme.md', text: '# Heading\nBody' }),
    source({ id: 'pdf', kind: 'pdf', title: 'manual.pdf', text: 'page one\npage two', pages: [{ pageNumber: 1, text: 'page one' }, { pageNumber: 2, text: 'page two' }] }),
    source({ id: 'docx', kind: 'docx', title: 'brief.docx', text: 'docx body' }),
    source({ id: 'xlsx', kind: 'xlsx', title: 'sheet.xlsx', text: 'cell data' }),
    source({ id: 'html', kind: 'html', title: 'page.html', html: '<main><h1>Title</h1><script>bad()</script><p>Body</p></main>' }),
    source({ id: 'url', kind: 'url', title: 'Article', url: 'https://example.com/a?token=secret#frag', html: '<article>Fetched body</article>' }),
    source({ id: 'sitemap', kind: 'sitemap', title: 'Sitemap', url: 'https://example.com/sitemap.xml', entries: [
      { url: 'https://example.com/a', title: 'A', text: 'Alpha article' },
      { url: 'https://example.com/b', title: 'B', html: '<p>Beta article</p>' },
    ] }),
  ];

  const documents = sources.flatMap((item) => createKnowledgeIngestionDocument(
    { id: `job-${item.id}`, sourceId: item.id, status: 'parse', attempts: 1, createdAt: timestamp, updatedAt: timestamp, history: [] },
    item,
    timestamp,
  ));

  assert.equal(documents.length, 9);
  assert.deepEqual(documents.map((document) => document.kind), ['text', 'markdown', 'pdf', 'docx', 'xlsx', 'html', 'url', 'url', 'url']);
  assert.equal(documents.find((document) => document.id.includes('html'))?.text, 'Title Body');
  assert.equal(documents.find((document) => document.title === 'Article')?.sourceUri, 'https://example.com/a');
  assert.equal(documents.filter((document) => document.sourceUri?.startsWith('https://example.com/')).length, 3);
  assert.equal(documents.find((document) => document.title === 'manual.pdf')?.pages?.[1]?.pageNumber, 2);
});

test('knowledge ingestion deduplicates unchanged sources by content hash', () => {
  let state = addKnowledgeIngestionSource(createKnowledgeBaseState(), source({ id: 'first', text: 'same body' }), { now: () => timestamp });
  state = addKnowledgeIngestionSource(state, source({ id: 'second', text: 'same body' }), { now: () => '2026-05-02T13:03:00.000Z' });

  assert.equal(state.ingestion.jobs.length, 2);
  assert.equal(state.ingestion.jobs[0]?.status, 'skipped');
  assert.equal(state.ingestion.jobs[0]?.duplicateOf, 'first');
  assert.equal(state.ingestion.sources[1]?.contentHash, state.ingestion.sources[0]?.contentHash);
});

test('knowledge chunks preserve citation-ready source metadata', () => {
  const job = { id: 'job-pdf', sourceId: 'pdf', status: 'parse' as const, attempts: 1, createdAt: timestamp, updatedAt: timestamp, history: [] };
  const [document] = createKnowledgeIngestionDocument(job, source({
    id: 'pdf',
    kind: 'pdf',
    title: 'manual.pdf',
    pages: [{ pageNumber: 1, text: 'Alpha install' }, { pageNumber: 2, text: 'Beta proxy' }],
    text: 'Alpha install\nBeta proxy',
  }), timestamp);
  const state = addKnowledgeIngestionSource(createKnowledgeBaseState(), source({ id: 'pdf', kind: 'pdf', text: 'Alpha install\nBeta proxy' }), { now: () => timestamp });
  const indexed = {
    ...state,
    documents: [document],
    chunks: [],
  };

  const withDocument = addKnowledgeDocument(indexed, document);
  assert.equal(withDocument.chunks[1]?.pageNumber, 2);
  assert.equal(withDocument.chunks[1]?.sourceKind, 'pdf');
  assert.equal(withDocument.chunks[1]?.contentHash, document.contentHash);
});

test('three-platform ingestion status reports shared and desktop-only capabilities', () => {
  const web = describeKnowledgeIngestionPlatform('web');
  const desktop = describeKnowledgeIngestionPlatform('desktop');
  const mobile = describeKnowledgeIngestionPlatform('mobile');

  assert.equal(web.supportedSources.includes('url'), true);
  assert.equal(mobile.supportedSources.includes('sitemap'), true);
  assert.equal(desktop.supportedSources.includes('directory'), true);
  assert.equal(web.supportedSources.includes('directory'), false);
  assert.equal(desktop.directoryImport, 'supported');
  assert.equal(mobile.directoryImport, 'unsupported');
});
