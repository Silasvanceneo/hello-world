import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRagEvalViewModel,
  renderRagEvalReport,
} from '../apps/web/src/rag-eval.js';

const report = {
  total: 3,
  hitRate: 0.6667,
  citationAccuracy: 0.5,
  noAnswerAccuracy: 1,
  cases: [
    { id: 'q1', hit: true, citationAccurate: true, noAnswer: false, topCitationLabels: ['Doc#1'] },
    { id: 'q2<script>', hit: false, citationAccurate: false, noAnswer: false, topCitationLabels: ['<bad>'] },
  ],
};

test('RAG eval view model formats retrieval quality metrics', () => {
  const model = createRagEvalViewModel(report);

  assert.equal(model.total, 3);
  assert.equal(model.hitRateLabel, '66.7%');
  assert.equal(model.citationAccuracyLabel, '50.0%');
  assert.equal(model.noAnswerAccuracyLabel, '100.0%');
  assert.equal(model.passing, false);
});

test('RAG eval renderer escapes case ids and citations', () => {
  const html = renderRagEvalReport(report);

  assert.match(html, /66\.7%/);
  assert.match(html, /q2&lt;script&gt;/);
  assert.match(html, /&lt;bad&gt;/);
  assert.doesNotMatch(html, /<script>/);
});
