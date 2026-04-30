import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chooseModelRoute,
  rankModelRoutes,
  type ModelRouteCandidate,
} from '../packages/core/src/model/model-routing.ts';
import { inferModelCapability } from '../packages/core/src/model/model-capability.ts';

function candidate(partial: Partial<ModelRouteCandidate> & Pick<ModelRouteCandidate, 'providerId' | 'modelId'>): ModelRouteCandidate {
  return {
    providerId: partial.providerId,
    providerName: partial.providerName ?? partial.providerId,
    providerType: partial.providerType ?? 'openai-compatible',
    modelId: partial.modelId,
    displayName: partial.displayName ?? partial.modelId,
    capability: partial.capability ?? inferModelCapability(partial.modelId),
    status: partial.status ?? 'available',
    inputPricePerMillion: partial.inputPricePerMillion,
    outputPricePerMillion: partial.outputPricePerMillion,
    averageLatencyMs: partial.averageLatencyMs,
    isLocal: partial.isLocal ?? false,
  };
}

test('model routing prefers cheaper candidates for cheap strategy', () => {
  const ranked = rankModelRoutes([
    candidate({ providerId: 'expensive', modelId: 'gpt-4.1', inputPricePerMillion: 5, outputPricePerMillion: 15 }),
    candidate({ providerId: 'cheap', modelId: 'gpt-4.1-mini', inputPricePerMillion: 0.2, outputPricePerMillion: 0.8 }),
  ], { strategy: 'cheap', task: 'text' });

  assert.equal(ranked[0].providerId, 'cheap');
});

test('model routing can prefer speed, long context, privacy, and fallback', () => {
  const local = candidate({ providerId: 'ollama', providerType: 'ollama', modelId: 'llama3.2', averageLatencyMs: 900, isLocal: true });
  const fast = candidate({ providerId: 'fast', modelId: 'gpt-4.1-mini', averageLatencyMs: 120 });
  const long = candidate({ providerId: 'long', modelId: 'claude-4-200k', averageLatencyMs: 500 });

  assert.equal(chooseModelRoute([local, fast, long], { strategy: 'fast', task: 'text' })?.providerId, 'fast');
  assert.equal(chooseModelRoute([local, fast, long], { strategy: 'long-context', task: 'text' })?.providerId, 'long');
  assert.equal(chooseModelRoute([local, fast, long], { strategy: 'privacy', task: 'text' })?.providerId, 'ollama');
  assert.notEqual(chooseModelRoute([local, fast, long], { strategy: 'fallback', task: 'text', failedProviderIds: ['fast'] })?.providerId, 'fast');
});

test('model routing filters unavailable and incompatible candidates', () => {
  const text = candidate({ providerId: 'text', modelId: 'tiny-text', capability: inferModelCapability('tiny-text') });
  const vision = candidate({ providerId: 'vision', modelId: 'gpt-4o', capability: inferModelCapability('gpt-4o') });
  const unavailable = candidate({ providerId: 'down', modelId: 'gpt-4o', status: 'unavailable' });

  const route = chooseModelRoute([text, vision, unavailable], { strategy: 'balanced', task: 'vision' });

  assert.equal(route?.providerId, 'vision');
});
