import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChatSession, ProviderConnection, TokenUsage } from '@hello-world/shared';
import type { ProviderAdapter } from '../packages/api-client/src/index.ts';
import { compareModels, saveComparisonSelection } from '../packages/core/src/model/model-comparison.ts';

function createSession(): ChatSession {
  return {
    id: 'session-1',
    title: 'Comparison',
    messages: [],
    tags: [],
    createdAt: '2026-04-29T00:00:00.000Z',
    updatedAt: '2026-04-29T00:00:00.000Z',
    syncState: 'local',
  };
}

function createConnection(id: string): ProviderConnection {
  return {
    id,
    type: 'custom',
    name: id,
    enabled: true,
    createdAt: '2026-04-29T00:00:00.000Z',
    updatedAt: '2026-04-29T00:00:00.000Z',
  };
}

function createAdapter(text: string, usage?: TokenUsage): ProviderAdapter {
  return {
    id: `adapter-${text}`,
    type: 'custom',
    async listModels() { return []; },
    async validateConnection() { return { ok: true, checkedAt: '2026-04-29T00:00:00.000Z', models: [] }; },
    async *chat(request) {
      assert.equal(request.messages.at(-1)?.content, 'Compare this');
      yield { type: 'text-delta', text };
      if (usage) {
        yield { type: 'usage', usage };
      }
      yield { type: 'done' };
    },
  };
}

test('compareModels runs the same prompt against multiple candidates', async () => {
  let id = 0;
  let ms = 100;
  const usage = { promptTokens: 2, completionTokens: 3, totalTokens: 5 };
  const run = await compareModels({
    session: createSession(),
    prompt: 'Compare this',
    candidates: [
      { id: 'a', adapter: createAdapter('Answer A', usage), connection: createConnection('provider-a'), modelId: 'model-a' },
      { id: 'b', adapter: createAdapter('Answer B'), connection: createConnection('provider-b'), modelId: 'model-b' },
    ],
    context: {
      createId: () => `run-${++id}`,
      now: () => '2026-04-29T00:00:00.000Z',
      nowMs: () => {
        ms += 10;
        return ms;
      },
    },
  });

  assert.equal(run.results.length, 2);
  assert.equal(run.results[0]?.text, 'Answer A');
  assert.equal(run.results[0]?.usage?.totalTokens, 5);
  assert.equal(run.results[1]?.modelId, 'model-b');
  assert.equal(run.results.every((result) => result.durationMs >= 0), true);
});

test('saveComparisonSelection appends the chosen answer to the main chat branch', async () => {
  let id = 0;
  const run = await compareModels({
    session: createSession(),
    prompt: 'Compare this',
    candidates: [
      { id: 'winner', adapter: createAdapter('Chosen answer'), connection: createConnection('provider-a'), modelId: 'model-a' },
    ],
    context: { createId: () => `run-${++id}`, now: () => '2026-04-29T00:00:00.000Z', nowMs: () => 1 },
  });
  const saved = saveComparisonSelection({
    session: createSession(),
    run,
    resultId: 'winner',
    context: { createId: () => `msg-${++id}`, now: () => '2026-04-29T00:01:00.000Z' },
  });

  assert.equal(saved.messages.length, 2);
  assert.equal(saved.messages[0]?.role, 'user');
  assert.equal(saved.messages[1]?.role, 'assistant');
  assert.equal(saved.messages[1]?.modelId, 'model-a');
  assert.deepEqual(saved.messages[1]?.content, [{ type: 'text', text: 'Chosen answer' }]);
  assert.equal(saved.syncState, 'dirty');
});

test('compareModels records provider errors without failing the whole run', async () => {
  const failingAdapter: ProviderAdapter = {
    id: 'failing',
    type: 'custom',
    async listModels() { return []; },
    async validateConnection() { return { ok: true, checkedAt: '2026-04-29T00:00:00.000Z', models: [] }; },
    async *chat() {
      throw new Error('401 auth failed');
    },
  };

  const run = await compareModels({
    session: createSession(),
    prompt: 'Compare this',
    candidates: [
      { id: 'failed', adapter: failingAdapter, connection: createConnection('provider-a'), modelId: 'model-a' },
    ],
    context: { createId: () => 'run-1', now: () => '2026-04-29T00:00:00.000Z', nowMs: () => 1 },
  });

  assert.equal(run.results[0]?.status, 'failed');
  assert.equal(run.results[0]?.error?.code, 'auth');
});
