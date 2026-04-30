import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aggregateCostByPeriod,
  applyEstimatedCosts,
  createBudgetReminder,
  estimateUsageCost,
  findModelPrice,
} from '../packages/core/src/usage/cost-estimation.ts';
import type { UsageRecord } from '@hello-world/shared';

const records: UsageRecord[] = [
  {
    id: 'u1',
    sessionId: 's1',
    messageId: 'm1',
    modelId: 'gpt-4.1-mini',
    usage: { promptTokens: 1_000, completionTokens: 2_000, totalTokens: 3_000 },
    createdAt: '2026-04-01T10:00:00.000Z',
  },
  {
    id: 'u2',
    sessionId: 's1',
    messageId: 'm2',
    modelId: 'gpt-4.1-mini',
    usage: { promptTokens: 500, completionTokens: 500, totalTokens: 1_000 },
    createdAt: '2026-04-02T10:00:00.000Z',
  },
];

test('cost estimation finds model pricing by pattern and estimates one request', () => {
  const price = findModelPrice('gpt-4.1-mini');
  const cost = estimateUsageCost({ promptTokens: 1_000, completionTokens: 2_000, totalTokens: 3_000 }, 'gpt-4.1-mini');

  assert.equal(price?.currency, 'USD');
  assert.equal(round(cost.amount), 0.0018);
});

test('cost estimation applies prices and aggregates daily/monthly trends', () => {
  const enriched = applyEstimatedCosts(records);
  const byDay = aggregateCostByPeriod(enriched, 'day');
  const byMonth = aggregateCostByPeriod(enriched, 'month');

  assert.equal(round(enriched[0]?.usage.estimatedCost ?? 0), 0.0018);
  assert.deepEqual(byDay.map((bucket) => bucket.key), ['2026-04-01', '2026-04-02']);
  assert.equal(byMonth[0]?.key, '2026-04');
  assert.equal(round(byMonth[0]?.estimatedCost ?? 0), 0.0023);
});

test('budget reminders warn when local daily or monthly limits are reached', () => {
  const enriched = applyEstimatedCosts(records);
  const reminder = createBudgetReminder(enriched, {
    dailyLimit: 0.001,
    monthlyLimit: 0.002,
    currency: 'USD',
    now: '2026-04-02T12:00:00.000Z',
  });

  assert.equal(reminder.level, 'warning');
  assert.match(reminder.message, /Monthly budget/);
});

function round(value: number): number {
  return Number(value.toFixed(6));
}
