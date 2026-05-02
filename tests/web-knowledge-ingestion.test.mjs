import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createKnowledgeIngestionViewModel,
  renderKnowledgeIngestionStatus,
} from '../apps/web/src/knowledge-ingestion.js';

const state = {
  ingestion: {
    sources: [{ id: 's1', kind: 'pdf', title: 'manual.pdf', contentHash: 'h1', createdAt: '2026-05-02T13:00:00.000Z' }],
    jobs: [
      { id: 'j1', sourceId: 's1', status: 'index', attempts: 1, createdAt: '', updatedAt: '', history: [] },
      { id: 'j2', sourceId: 's2', status: 'failed', attempts: 2, error: 'Parse failed', createdAt: '', updatedAt: '', history: [] },
      { id: 'j3', sourceId: 's3', status: 'skipped', attempts: 1, duplicateOf: 's1', createdAt: '', updatedAt: '', history: [] },
    ],
  },
};

test('knowledge ingestion view model summarizes jobs and shared platform capabilities', () => {
  const model = createKnowledgeIngestionViewModel(state, 'web', { t: (key, values = {}) => `${key}:${values.count ?? ''}` });

  assert.equal(model.platform, 'web');
  assert.equal(model.totalJobs, 3);
  assert.equal(model.failedJobs, 1);
  assert.equal(model.statusCounts.index, 1);
  assert.equal(model.statusCounts.failed, 1);
  assert.equal(model.supportedSources.includes('url'), true);
  assert.equal(model.supportedSources.includes('directory'), false);
  assert.equal(model.directoryImport, 'unsupported');
});

test('knowledge ingestion view model exposes desktop-only directory import', () => {
  const model = createKnowledgeIngestionViewModel(state, 'desktop');

  assert.equal(model.directoryImport, 'supported');
  assert.equal(model.supportedSources.includes('directory'), true);
});

test('knowledge ingestion status rendering escapes source and error labels', () => {
  const html = renderKnowledgeIngestionStatus({
    ingestion: {
      jobs: [
        { id: 'j1<script>', sourceId: 's1', status: 'failed', attempts: 1, error: '<bad>', createdAt: '', updatedAt: '', history: [] },
      ],
    },
  }, 'mobile');

  assert.match(html, /mobile/);
  assert.match(html, /failed/);
  assert.match(html, /&lt;bad&gt;/);
  assert.doesNotMatch(html, /<script>/);
});
