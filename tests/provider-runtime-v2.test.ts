import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createOllamaAdapter,
  createOpenAICompatibleAdapter,
  createProviderRegistry,
  getProviderCapabilities,
  listProviderCapabilities,
} from '../packages/api-client/src/index.ts';
import type { ProviderConnection } from '@hello-world/shared';

function connection(type: ProviderConnection['type'], id = `${type}-1`): ProviderConnection {
  return {
    id,
    type,
    name: type,
    enabled: true,
    createdAt: '2026-05-02T11:15:00.000Z',
    updatedAt: '2026-05-02T11:15:00.000Z',
  };
}

test('provider runtime v2 advertises OpenAI-compatible capabilities without credentials', () => {
  const adapter = createOpenAICompatibleAdapter();

  assert.equal(adapter.capabilities.protocol, 'openai-compatible');
  assert.equal(adapter.capabilities.transport, 'https');
  assert.equal(adapter.capabilities.browserDirect, 'cors-dependent');
  assert.equal(adapter.capabilities.models.list, true);
  assert.equal(adapter.capabilities.chat.streaming, true);
  assert.equal(adapter.capabilities.embeddings, 'unknown');
  assert.equal(adapter.capabilities.imageGeneration, 'supported');
  assert.equal(adapter.capabilities.audioInput, 'unsupported');
  assert.equal(adapter.capabilities.audioOutput, 'unsupported');
  assert.equal(adapter.capabilities.toolCalls, 'unknown');
});

test('provider runtime v2 advertises Ollama as local runtime with no browser CORS dependency', () => {
  const adapter = createOllamaAdapter();

  assert.equal(adapter.capabilities.protocol, 'ollama');
  assert.equal(adapter.capabilities.transport, 'local-http');
  assert.equal(adapter.capabilities.browserDirect, 'supported');
  assert.equal(adapter.capabilities.models.list, true);
  assert.equal(adapter.capabilities.chat.streaming, true);
  assert.equal(adapter.capabilities.embeddings, 'unsupported');
  assert.equal(adapter.capabilities.imageGeneration, 'unsupported');
  assert.equal(adapter.capabilities.toolCalls, 'unknown');
});

test('provider registry exposes capability summaries without live provider calls', () => {
  let fetchCalled = false;
  const registry = createProviderRegistry();

  const openai = getProviderCapabilities(registry, connection('openai'), {
    fetch: async () => {
      fetchCalled = true;
      throw new Error('should not fetch');
    },
  });
  const capabilities = listProviderCapabilities(registry);

  assert.equal(fetchCalled, false);
  assert.equal(openai.providerType, 'openai');
  assert.equal(openai.protocol, 'openai-responses');
  assert.equal(openai.features.chatStreaming, true);
  assert.equal(openai.features.modelListing, true);
  assert.equal(openai.features.embeddings, 'supported');
  assert.equal(capabilities.some((item) => item.providerType === 'ollama' && item.transport === 'local-http'), true);
  assert.equal(capabilities.some((item) => item.providerType === 'anthropic' && item.protocol === 'anthropic-messages'), true);
  assert.equal(capabilities.some((item) => item.providerType === 'gemini' && item.protocol === 'gemini-native'), true);
});

test('provider runtime v2 fails clearly for custom providers without an adapter', () => {
  const registry = createProviderRegistry();

  assert.throws(() => getProviderCapabilities(registry, connection('custom')), /No provider adapter registered/);
});
