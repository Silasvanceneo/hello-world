import assert from 'node:assert/strict';
import test from 'node:test';
import { compareProvidersInBrowser, estimateTokenUsage, formatComparisonResult } from '../apps/web/src/model-comparison.js';

const providers = [
  { id: 'p1', type: 'openai-compatible', name: 'Provider One', defaultModelId: 'model-a', enabled: true },
  { id: 'p2', type: 'ollama', name: 'Provider Two', defaultModelId: 'model-b', enabled: true },
];

test('compareProvidersInBrowser returns side-by-side browser comparison data', async () => {
  const calls = [];
  const desktopFetch = async () => new Response('ok');
  const results = await compareProvidersInBrowser({
    providers,
    prompt: 'same prompt',
    providerSecrets: new Map([['p1', 'runtime-key']]),
    messages: [{ role: 'system', content: 'be concise' }],
    fetch: desktopFetch,
    now: () => '2026-04-29T00:00:00.000Z',
    nowMs: () => 100,
    streamChat: async (request) => {
      calls.push(request);
      return `${request.modelId}: ${request.messages.at(-1).content}`;
    },
  });

  assert.equal(results.length, 2);
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[0].text, 'model-a: same prompt');
  assert.equal(results[0].usage.totalTokens, 5);
  assert.equal(calls[0].apiKey, 'runtime-key');
  assert.equal(calls[0].fetch, desktopFetch);
  assert.equal(calls[1].messages.at(-1).content, 'same prompt');
});

test('formatComparisonResult exposes speed, token, error, and save state', async () => {
  const usage = estimateTokenUsage('hello world', 'short answer');
  assert.deepEqual(usage, { promptTokens: 2, completionTokens: 2, totalTokens: 4 });

  const ready = formatComparisonResult({
    providerName: 'Provider',
    modelId: 'model',
    status: 'fulfilled',
    text: 'ok',
    usage,
    durationMs: 123,
  });
  assert.equal(ready.tokenLabel, '4 tokens');
  assert.equal(ready.speedLabel, '123 ms');
  assert.equal(ready.canSave, true);

  const failed = formatComparisonResult({
    providerName: 'Provider',
    modelId: 'model',
    status: 'failed',
    text: '',
    errorMessage: 'network down',
    durationMs: 50,
  });
  assert.match(failed.statusLabel, /network down/);
  assert.equal(failed.canSave, false);
});
