import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultBaseUrl, defaultModel, parseOllamaBrowserStream, parseOpenAIBrowserStream, providerEndpoint, streamChatInBrowser, validateProviderInBrowser } from '../apps/web/src/provider-runtime.js';

function response(body, init = {}) {
  return new Response(body, { status: 200, headers: { 'content-type': 'application/json' }, ...init });
}

test('provider runtime resolves defaults and endpoints', () => {
  assert.equal(defaultBaseUrl('ollama'), 'http://127.0.0.1:11434');
  assert.equal(defaultModel('ollama'), 'llama3.2');
  assert.equal(providerEndpoint({ type: 'ollama', baseUrl: 'http://localhost:11434/' }, '/api/chat'), 'http://localhost:11434/api/chat');
});

test('provider validation maps OpenAI-compatible and Ollama model lists', async () => {
  const openaiModels = await validateProviderInBrowser({ type: 'openai-compatible', baseUrl: 'https://api.example.test/v1' }, {
    apiKey: 'runtime-key',
    fetch: async (_url, init) => {
      assert.equal(new Headers(init.headers).get('authorization'), 'Bearer runtime-key');
      return response(JSON.stringify({ data: [{ id: 'gpt-test' }] }));
    },
  });
  const ollamaModels = await validateProviderInBrowser({ type: 'ollama', baseUrl: 'http://localhost:11434' }, {
    fetch: async () => response(JSON.stringify({ models: [{ name: 'llama3.2' }] })),
  });

  assert.deepEqual(openaiModels, ['gpt-test']);
  assert.deepEqual(ollamaModels, ['llama3.2']);
});

test('browser stream parsers emit provider deltas', async () => {
  const openaiChunks = [];
  for await (const chunk of parseOpenAIBrowserStream(response('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\ndata: [DONE]\n\n').body)) {
    openaiChunks.push(chunk);
  }
  const ollamaChunks = [];
  for await (const chunk of parseOllamaBrowserStream(response('{"message":{"content":"Yo"}}\n{"done":true}\n').body)) {
    ollamaChunks.push(chunk);
  }

  assert.equal(openaiChunks[0]?.text, 'Hi');
  assert.equal(ollamaChunks[0]?.text, 'Yo');
});

test('streamChatInBrowser posts to provider and returns full streamed text', async () => {
  const text = await streamChatInBrowser({
    provider: { type: 'openai-compatible', baseUrl: 'https://api.example.test/v1' },
    modelId: 'gpt-test',
    apiKey: 'runtime-key',
    messages: [{ role: 'user', content: 'Hello' }],
    fetch: async (url, init) => {
      assert.equal(url, 'https://api.example.test/v1/chat/completions');
      assert.equal(JSON.parse(init.body).model, 'gpt-test');
      return response('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: {"choices":[{"delta":{"content":"!"}}]}\n\n');
    },
  });

  assert.equal(text, 'Hello!');
});
