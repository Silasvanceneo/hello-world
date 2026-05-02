import assert from 'node:assert/strict';
import test from 'node:test';
import type { KnowledgeChunk, KnowledgeDocument } from '@hello-world/shared';
import {
  addKnowledgeDocument,
  buildCitationContext,
  createKnowledgeBaseState,
  createLocalEmbeddingProvider,
  createVectorIndex,
  evaluateRagRetrieval,
  hybridSearchKnowledge,
  indexKnowledgeChunks,
} from '../packages/core/src/knowledge/knowledge-base.ts';

const base = '2026-05-02T14:00:00.000Z';

function doc(id: string, title: string, text: string, metadata: Partial<KnowledgeDocument> = {}): KnowledgeDocument {
  return {
    id,
    title,
    text,
    scope: 'library',
    kind: metadata.kind ?? 'markdown',
    sourceUri: metadata.sourceUri,
    contentHash: metadata.contentHash ?? `hash:${id}`,
    createdAt: base,
    updatedAt: base,
    ...metadata,
  };
}

test('local embedding provider returns deterministic normalized vectors', async () => {
  const provider = createLocalEmbeddingProvider({ dimensions: 16 });
  const [left] = await provider.embed(['Alpha beta beta']);
  const [right] = await provider.embed(['Alpha beta beta']);
  const [different] = await provider.embed(['Gamma delta']);

  assert.deepEqual(left.values, right.values);
  assert.equal(left.values.length, 16);
  assert.equal(Number(left.values.reduce((sum, value) => sum + value * value, 0).toFixed(6)), 1);
  assert.notDeepEqual(left.values, different.values);
});

test('vector index stores chunk embeddings for Web/Mobile lightweight and Desktop durable modes', async () => {
  let state = createKnowledgeBaseState();
  state = addKnowledgeDocument(state, doc('doc-1', 'Install guide', 'Install the desktop package and configure proxy settings.'));
  const provider = createLocalEmbeddingProvider({ dimensions: 12 });

  const webIndex = await indexKnowledgeChunks(createVectorIndex('web-memory'), state.chunks, provider);
  const desktopIndex = await indexKnowledgeChunks(createVectorIndex('desktop-durable'), state.chunks, provider);

  assert.equal(webIndex.mode, 'web-memory');
  assert.equal(desktopIndex.mode, 'desktop-durable');
  assert.equal(webIndex.items.length, state.chunks.length);
  assert.equal(webIndex.items[0]?.chunkId, state.chunks[0]?.id);
  assert.equal(webIndex.items[0]?.embedding.values.length, 12);
});

test('hybrid retrieval combines lexical and vector signals with metadata filters', async () => {
  let state = createKnowledgeBaseState();
  state = addKnowledgeDocument(state, doc('doc-1', 'Proxy manual', 'Configure corporate proxy and certificate trust.', { kind: 'pdf', sourceUri: 'https://docs.example/proxy' }));
  state = addKnowledgeDocument(state, doc('doc-2', 'Billing note', 'Monthly budget and invoice review.', { kind: 'markdown', sourceUri: 'https://docs.example/billing' }));
  const index = await indexKnowledgeChunks(createVectorIndex('web-memory'), state.chunks, createLocalEmbeddingProvider());

  const results = await hybridSearchKnowledge(state, 'proxy certificate', {
    vectorIndex: index,
    embeddingProvider: createLocalEmbeddingProvider(),
    metadata: { sourceKind: 'pdf' },
    limit: 3,
  });

  assert.equal(results[0]?.chunk.title, 'Proxy manual');
  assert.equal(results.every((result) => result.chunk.sourceKind === 'pdf'), true);
  assert.match(buildCitationContext(results), /\[Proxy manual#1\]/);
});

test('hybrid retrieval supports reranking hooks without mutating source chunks', async () => {
  let state = createKnowledgeBaseState();
  state = addKnowledgeDocument(state, doc('doc-1', 'First', 'alpha beta'));
  state = addKnowledgeDocument(state, doc('doc-2', 'Second', 'alpha beta gamma'));
  const before = state.chunks.map((chunk) => ({ ...chunk }));

  const results = await hybridSearchKnowledge(state, 'alpha', {
    vectorIndex: await indexKnowledgeChunks(createVectorIndex('web-memory'), state.chunks, createLocalEmbeddingProvider()),
    embeddingProvider: createLocalEmbeddingProvider(),
    rerank: (items) => [...items].sort((left, right) => right.chunk.title.localeCompare(left.chunk.title)),
  });

  assert.equal(results[0]?.chunk.title, 'Second');
  assert.deepEqual(state.chunks, before);
});

test('RAG evaluation measures hit rate, citation accuracy, and no-answer behavior', async () => {
  let state = createKnowledgeBaseState();
  state = addKnowledgeDocument(state, doc('doc-1', 'Proxy manual', 'Configure proxy settings before login.'));
  state = addKnowledgeDocument(state, doc('doc-2', 'Budget guide', 'Budget alerts use estimated local token cost.'));
  const provider = createLocalEmbeddingProvider();
  const vectorIndex = await indexKnowledgeChunks(createVectorIndex('web-memory'), state.chunks, provider);

  const report = await evaluateRagRetrieval(state, [
    { id: 'q1', query: 'How do I configure proxy?', expectedDocumentIds: ['doc-1'], expectedCitationLabels: ['Proxy manual#1'] },
    { id: 'q2', query: 'What controls budget alerts?', expectedDocumentIds: ['doc-2'], expectedCitationLabels: ['Budget guide#1'] },
    { id: 'q3', query: 'unrelated quantum topic', expectedNoAnswer: true },
  ], { embeddingProvider: provider, vectorIndex, noAnswerThreshold: 0.2 });

  assert.equal(report.total, 3);
  assert.equal(report.hitRate, 1);
  assert.equal(report.citationAccuracy, 1);
  assert.equal(report.noAnswerAccuracy, 1);
  assert.equal(report.cases.find((item) => item.id === 'q3')?.noAnswer, true);
});

test('hybrid retrieval returns a no-answer marker when scores are below threshold', async () => {
  let state = createKnowledgeBaseState();
  state = addKnowledgeDocument(state, doc('doc-1', 'Local doc', 'only billing information'));
  const results = await hybridSearchKnowledge(state, 'volcanic geology', {
    embeddingProvider: createLocalEmbeddingProvider(),
    vectorIndex: await indexKnowledgeChunks(createVectorIndex('web-memory'), state.chunks, createLocalEmbeddingProvider()),
    noAnswerThreshold: 0.8,
  });

  assert.equal(results.length, 0);
});
