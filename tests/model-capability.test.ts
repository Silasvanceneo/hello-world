import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseModelsForTask, getUiCapabilityAvailability, inferModelCapability, mergeModelCapability } from '../packages/core/src/model/model-capability.ts';

test('model capability inference recognizes vision, file, tool, and reasoning models', () => {
  const gpt = inferModelCapability('gpt-4.1-mini');
  const reasoning = inferModelCapability('deepseek-reasoner');
  const image = inferModelCapability('gpt-image-1');

  assert.equal(gpt.supportsVision, true);
  assert.equal(gpt.supportsFiles, true);
  assert.equal(gpt.supportsTools, true);
  assert.equal(gpt.contextWindow, 128000);
  assert.equal(reasoning.supportsReasoning, true);
  assert.equal(image.supportsImageGeneration, true);
  assert.equal(image.supportsText, false);
});

test('UI capability availability gives actionable disabled reasons', () => {
  const availability = getUiCapabilityAvailability(inferModelCapability('tiny-text-model'));

  assert.equal(availability.imageInput.enabled, false);
  assert.match(availability.imageInput.reason ?? '', /vision-capable/);
  assert.equal(availability.reasoningControls.enabled, false);
});

test('model capabilities can be overridden by explicit provider metadata', () => {
  const merged = mergeModelCapability(inferModelCapability('custom-model'), { supportsVision: true, contextWindow: 64000 });

  assert.equal(merged.supportsVision, true);
  assert.equal(merged.contextWindow, 64000);
});

test('models can be filtered by task capability', () => {
  const models = [
    { id: 'text', providerId: 'p', displayName: 'Text', capability: inferModelCapability('small-text'), status: 'available' as const },
    { id: 'vision', providerId: 'p', displayName: 'Vision', capability: inferModelCapability('gpt-4o'), status: 'available' as const },
  ];

  assert.deepEqual(chooseModelsForTask(models, 'vision').map((model) => model.id), ['vision']);
});
