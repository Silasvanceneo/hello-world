import assert from 'node:assert/strict';
import test from 'node:test';
import { createCostDashboardViewModel, createUsageRecordsFromWebState } from '../apps/web/src/cost-dashboard.js';
import { addMessageToActiveSession, createInitialWebState, createTextMessage } from '../apps/web/src/web-state.js';

test('web cost dashboard creates records and budget labels from local chat state', () => {
  let state = createInitialWebState('2026-04-30T00:00:00.000Z');
  state = addMessageToActiveSession(state, createTextMessage('user', 'Hello', '2026-04-30T01:00:00.000Z', 'u1'));
  state = addMessageToActiveSession(state, {
    ...createTextMessage('assistant', 'World', '2026-04-30T01:00:01.000Z', 'a1'),
    modelId: 'gpt-4.1-mini',
    usage: { promptTokens: 1_000, completionTokens: 1_000, totalTokens: 2_000 },
  });

  const records = createUsageRecordsFromWebState(state);
  const view = createCostDashboardViewModel(records, {
    dailyLimit: 0.001,
    monthlyLimit: 0.01,
    currency: 'USD',
    now: '2026-04-30T03:00:00.000Z',
  });

  assert.equal(records.length, 1);
  assert.match(view.totalCostLabel, /\$/);
  assert.match(view.budgetMessage, /Daily budget/);
  assert.equal(view.byDay[0]?.key, '2026-04-30');
});
