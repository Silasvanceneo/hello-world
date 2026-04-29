import assert from 'node:assert/strict';
import test from 'node:test';
import { describeModelList, describeProviderValidationError } from '../apps/web/src/provider-diagnostics.js';

test('web provider diagnostics explain validation failures', () => {
  const openai = { name: 'OpenAI', type: 'openai-compatible' };
  const ollama = { name: 'Local Ollama', type: 'ollama' };

  assert.match(describeProviderValidationError(new Error('401 auth failed'), openai), /API key/);
  assert.match(describeProviderValidationError(new TypeError('Failed to fetch'), ollama), /Ollama/);
  assert.match(describeProviderValidationError(new Error('CORS blocked'), openai), /CORS/);
});

test('web provider diagnostics provide model-list fallback messages', () => {
  assert.match(describeModelList([], 'gpt-missing'), /no models/i);
  assert.match(describeModelList(['gpt-a'], 'gpt-missing'), /fallback suggestion: gpt-a/);
  assert.match(describeModelList(['gpt-a'], 'gpt-a'), /Connected/);
});
