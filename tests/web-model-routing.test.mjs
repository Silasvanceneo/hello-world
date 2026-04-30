import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseProviderForRouting, describeRoutingChoice } from '../apps/web/src/model-routing.js';

test('browser routing chooses local providers for privacy and mini models for cheap routing', () => {
  const providers = [
    { id: 'remote', name: 'Remote', type: 'openai-compatible', defaultModelId: 'gpt-4.1', enabled: true },
    { id: 'mini', name: 'Mini', type: 'openai-compatible', defaultModelId: 'gpt-4.1-mini', enabled: true },
    { id: 'local', name: 'Local Ollama', type: 'ollama', defaultModelId: 'llama3.2', enabled: true },
  ];

  assert.equal(chooseProviderForRouting(providers, { strategy: 'privacy', task: 'text' })?.provider.id, 'local');
  assert.equal(chooseProviderForRouting(providers, { strategy: 'cheap', task: 'text' })?.provider.id, 'mini');
});

test('browser routing explains the selected provider and model', () => {
  const choice = chooseProviderForRouting([
    { id: 'p1', name: 'Provider', type: 'openai-compatible', defaultModelId: 'gpt-4.1-mini', enabled: true },
  ], { strategy: 'balanced', task: 'text' });

  assert.match(describeRoutingChoice(choice), /Provider/);
  assert.match(describeRoutingChoice(choice), /gpt-4.1-mini/);
});
