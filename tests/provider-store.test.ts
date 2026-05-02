import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addProviderConnection,
  createEmptyProviderStore,
  createProviderConnection,
  deleteProviderConnection,
  updateProviderConnection,
} from '../packages/core/src/provider/provider-store.ts';

test('provider store adds connections immutably and selects the first active connection', () => {
  const store = createEmptyProviderStore();
  const connection = createProviderConnection(
    {
      type: 'openai-compatible',
      name: '  OpenAI compatible  ',
      baseUrl: ' https://api.example.test/v1 ',
      defaultModelId: ' gpt-4.1-mini ',
      imageModelId: ' gpt-image-1 ',
    },
    { now: () => '2026-04-29T00:00:00.000Z', createId: () => 'provider-1' },
  );

  const updated = addProviderConnection(store, connection);

  assert.equal(store.connections.length, 0);
  assert.equal(updated.connections.length, 1);
  assert.equal(updated.connections[0]?.name, 'OpenAI compatible');
  assert.equal(updated.connections[0]?.baseUrl, 'https://api.example.test/v1');
  assert.equal(updated.connections[0]?.defaultModelId, 'gpt-4.1-mini');
  assert.equal(updated.connections[0]?.imageModelId, 'gpt-image-1');
  assert.equal(updated.activeConnectionId, 'provider-1');
});

test('provider store updates and deletes without mutating the original store', () => {
  const connection = createProviderConnection(
    { type: 'ollama', name: 'Ollama' },
    { now: () => '2026-04-29T00:00:00.000Z', createId: () => 'ollama-1' },
  );
  const store = addProviderConnection(createEmptyProviderStore(), connection);
  const renamed = updateProviderConnection(store, 'ollama-1', {
    name: '  Local Ollama  ',
    imageModelId: '  ',
  }, { now: () => '2026-04-29T01:00:00.000Z' });
  const deleted = deleteProviderConnection(renamed, 'ollama-1');

  assert.equal(store.connections[0]?.name, 'Ollama');
  assert.equal(renamed.connections[0]?.name, 'Local Ollama');
  assert.equal(renamed.connections[0]?.imageModelId, undefined);
  assert.equal(renamed.connections[0]?.updatedAt, '2026-04-29T01:00:00.000Z');
  assert.equal(deleted.connections.length, 0);
  assert.equal(deleted.activeConnectionId, undefined);
});
