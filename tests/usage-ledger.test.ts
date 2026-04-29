import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateUsageByDay, aggregateUsageByModel, collectUsageRecords, formatUsageSummary, summarizeUsage } from '../packages/core/src/usage/usage-ledger.ts';
import type { ChatSession } from '@hello-world/shared';

function session(): ChatSession {
  return {
    id: 'session-1',
    title: 'Usage',
    modelId: 'fallback-model',
    tags: [],
    createdAt: '2026-04-29T00:00:00.000Z',
    updatedAt: '2026-04-29T00:00:00.000Z',
    syncState: 'dirty',
    messages: [
      { id: 'user-1', role: 'user', content: [{ type: 'text', text: 'Hi' }], createdAt: '2026-04-29T00:00:00.000Z', updatedAt: '2026-04-29T00:00:00.000Z' },
      { id: 'assistant-1', role: 'assistant', modelId: 'gpt-test', usage: { promptTokens: 2, completionTokens: 3, totalTokens: 5, estimatedCost: 0.01 }, content: [{ type: 'text', text: 'Hello' }], createdAt: '2026-04-29T00:00:00.000Z', updatedAt: '2026-04-29T00:00:00.000Z' },
      { id: 'assistant-2', role: 'assistant', modelId: 'gpt-test', usage: { promptTokens: 4, completionTokens: 6, totalTokens: 10, estimatedCost: 0.02 }, content: [{ type: 'text', text: 'Again' }], createdAt: '2026-04-30T00:00:00.000Z', updatedAt: '2026-04-30T00:00:00.000Z' },
    ],
  };
}

test('usage ledger collects records only from messages with usage', () => {
  let id = 0;
  const records = collectUsageRecords(session(), { providerId: 'provider-1', createId: () => `usage-${++id}` });

  assert.equal(records.length, 2);
  assert.equal(records[0]?.providerId, 'provider-1');
  assert.equal(records[0]?.modelId, 'gpt-test');
});

test('usage summaries aggregate by total, model, and day', () => {
  const records = collectUsageRecords(session());
  const total = summarizeUsage(records);
  const byModel = aggregateUsageByModel(records);
  const byDay = aggregateUsageByDay(records);

  assert.deepEqual(total, { promptTokens: 6, completionTokens: 9, totalTokens: 15, estimatedCost: 0.03 });
  assert.equal(byModel[0]?.key, 'gpt-test');
  assert.equal(byModel[0]?.records, 2);
  assert.deepEqual(byDay.map((bucket) => bucket.key), ['2026-04-29', '2026-04-30']);
  assert.match(formatUsageSummary(total), /15 tokens/);
});
