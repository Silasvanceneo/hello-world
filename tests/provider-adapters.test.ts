import assert from 'node:assert/strict';
import test from 'node:test';
import { createOllamaAdapter, createOpenAICompatibleAdapter, createProviderRegistry, validateProviderConnection } from '../packages/api-client/src/index.ts';
import type { ProviderConnection } from '@hello-world/shared';

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });
}

test('openai-compatible adapter lists models and sends bearer token only at runtime', async () => {
  let authorizationHeader = '';
  const adapter = createOpenAICompatibleAdapter();
  const connection: ProviderConnection = {
    id: 'provider-1',
    type: 'openai-compatible',
    name: 'Custom OpenAI',
    baseUrl: 'https://api.example.test/v1',
    apiKeyRef: 'secret-ref-1',
    enabled: true,
    createdAt: '2026-04-29T00:00:00.000Z',
    updatedAt: '2026-04-29T00:00:00.000Z',
  };

  const models = await adapter.listModels(connection, {
    apiKey: 'runtime-secret',
    fetch: async (_url, init) => {
      authorizationHeader = new Headers(init?.headers).get('authorization') ?? '';
      return jsonResponse({ data: [{ id: 'gpt-test', owned_by: 'example' }] });
    },
  });

  assert.equal(authorizationHeader, 'Bearer runtime-secret');
  assert.equal(models[0]?.id, 'gpt-test');
  assert.equal(models[0]?.providerId, 'provider-1');
});

test('openai-compatible validation classifies auth failures', async () => {
  const adapter = createOpenAICompatibleAdapter();
  const status = await adapter.validateConnection(
    { id: 'provider-1', type: 'openai-compatible', name: 'OpenAI', enabled: true, createdAt: '', updatedAt: '' },
    {
      now: () => '2026-04-29T00:00:00.000Z',
      fetch: async () => jsonResponse({ error: { message: 'bad key' } }, { status: 401, statusText: 'Unauthorized' }),
    },
  );

  assert.equal(status.ok, false);
  if (!status.ok) {
    assert.equal(status.reason, 'auth');
    assert.match(status.message, /bad key/);
  }
});

test('ollama adapter maps local tag results to models', async () => {
  const adapter = createOllamaAdapter();
  const models = await adapter.listModels(
    { id: 'ollama-1', type: 'ollama', name: 'Ollama', enabled: true, createdAt: '', updatedAt: '' },
    { fetch: async () => jsonResponse({ models: [{ name: 'llama3.2' }] }) },
  );

  assert.deepEqual(models.map((model) => model.id), ['llama3.2']);
  assert.equal(models[0]?.ownedBy, 'ollama');
});

test('provider registry validates through the adapter for the connection type', async () => {
  const registry = createProviderRegistry();
  const status = await validateProviderConnection(
    registry,
    { id: 'ollama-1', type: 'ollama', name: 'Ollama', enabled: true, createdAt: '', updatedAt: '' },
    {
      now: () => '2026-04-29T00:00:00.000Z',
      fetch: async () => jsonResponse({ models: [{ name: 'mistral' }] }),
    },
  );

  assert.equal(status.ok, true);
  if (status.ok) {
    assert.equal(status.models?.[0]?.id, 'mistral');
  }
});
