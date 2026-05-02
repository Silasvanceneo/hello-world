import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultBaseUrl,
  defaultModel,
  nativeProviderKind,
  parseOllamaBrowserStream,
  parseOpenAIBrowserStream,
  providerEndpoint,
  streamChatInBrowser,
  validateProviderInBrowser,
} from '../apps/web/src/provider-runtime.js';

function response(body, init = {}) {
  return new Response(body, { status: 200, headers: { 'content-type': 'application/json' }, ...init });
}

test('provider runtime resolves defaults and endpoints', () => {
  assert.equal(defaultBaseUrl('ollama'), 'http://127.0.0.1:11434');
  assert.equal(defaultBaseUrl('anthropic'), 'https://api.anthropic.com/v1');
  assert.equal(defaultBaseUrl('gemini'), 'https://generativelanguage.googleapis.com/v1beta');
  assert.equal(defaultBaseUrl('azure-openai'), '');
  assert.equal(defaultBaseUrl('dashscope'), 'https://dashscope.aliyuncs.com/api/v1');
  assert.equal(defaultModel('ollama'), 'llama3.2');
  assert.equal(defaultModel('anthropic'), 'claude-sonnet-4-5');
  assert.equal(defaultModel('gemini'), 'gemini-2.5-flash');
  assert.equal(nativeProviderKind('openai-compatible'), 'openai-compatible');
  assert.equal(nativeProviderKind('anthropic'), 'anthropic-messages');
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

test('provider validation maps Anthropic, Gemini, Azure OpenAI, and DashScope native model lists', async () => {
  const anthropicModels = await validateProviderInBrowser({ type: 'anthropic', baseUrl: 'https://api.anthropic.com/v1' }, {
    apiKey: 'runtime-key',
    fetch: async (url, init) => {
      assert.equal(url, 'https://api.anthropic.com/v1/models');
      assert.equal(new Headers(init.headers).get('x-api-key'), 'runtime-key');
      return response(JSON.stringify({ data: [{ id: 'claude-sonnet-4-5' }] }));
    },
  });
  const geminiModels = await validateProviderInBrowser({ type: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' }, {
    apiKey: 'runtime-key',
    fetch: async (url, init) => {
      assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models');
      assert.equal(new Headers(init.headers).get('x-goog-api-key'), 'runtime-key');
      return response(JSON.stringify({ models: [{ name: 'models/gemini-2.5-flash' }] }));
    },
  });
  const azureModels = await validateProviderInBrowser({ type: 'azure-openai', baseUrl: 'https://example-resource.openai.azure.com?api-version=2025-04-01-preview' }, {
    apiKey: 'runtime-key',
    fetch: async (url, init) => {
      assert.equal(url, 'https://example-resource.openai.azure.com/openai/deployments?api-version=2025-04-01-preview');
      assert.equal(new Headers(init.headers).get('api-key'), 'runtime-key');
      return response(JSON.stringify({ data: [{ id: 'gpt-4.1-mini' }] }));
    },
  });
  const dashScopeModels = await validateProviderInBrowser({ type: 'dashscope', baseUrl: 'https://dashscope.aliyuncs.com/api/v1' }, {
    apiKey: 'runtime-key',
    fetch: async (url, init) => {
      assert.equal(url, 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/models');
      assert.equal(new Headers(init.headers).get('authorization'), 'Bearer runtime-key');
      return response(JSON.stringify({ data: [{ id: 'qwen-plus' }] }));
    },
  });

  assert.deepEqual(anthropicModels, ['claude-sonnet-4-5']);
  assert.deepEqual(geminiModels, ['gemini-2.5-flash']);
  assert.deepEqual(azureModels, ['gpt-4.1-mini']);
  assert.deepEqual(dashScopeModels, ['qwen-plus']);
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

test('streamChatInBrowser posts native Anthropic, Gemini, Azure, and DashScope requests', async () => {
  const anthropicText = await streamChatInBrowser({
    provider: { type: 'anthropic', baseUrl: 'https://api.anthropic.com/v1' },
    modelId: 'claude-sonnet-4-5',
    apiKey: 'runtime-key',
    messages: [{ role: 'system', content: 'Brief.' }, { role: 'user', content: 'Hello' }],
    fetch: async (url, init) => {
      assert.equal(url, 'https://api.anthropic.com/v1/messages');
      assert.equal(new Headers(init.headers).get('x-api-key'), 'runtime-key');
      assert.equal(JSON.parse(init.body).system, 'Brief.');
      return response('event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Claude"}}\n\n');
    },
  });
  const geminiText = await streamChatInBrowser({
    provider: { type: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
    modelId: 'gemini-2.5-flash',
    apiKey: 'runtime-key',
    messages: [{ role: 'user', content: 'Hello' }],
    fetch: async (url, init) => {
      assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse');
      assert.equal(new Headers(init.headers).get('x-goog-api-key'), 'runtime-key');
      return response('data: {"candidates":[{"content":{"parts":[{"text":"Gemini"}]}}]}\n\n');
    },
  });
  const azureText = await streamChatInBrowser({
    provider: { type: 'azure-openai', baseUrl: 'https://example-resource.openai.azure.com?api-version=2025-04-01-preview' },
    modelId: 'gpt-4.1-mini',
    apiKey: 'runtime-key',
    messages: [{ role: 'user', content: 'Hello' }],
    fetch: async (url, init) => {
      assert.equal(url, 'https://example-resource.openai.azure.com/openai/deployments/gpt-4.1-mini/chat/completions?api-version=2025-04-01-preview');
      assert.equal(new Headers(init.headers).get('api-key'), 'runtime-key');
      return response('data: {"choices":[{"delta":{"content":"Azure"}}]}\n\n');
    },
  });
  const dashScopeText = await streamChatInBrowser({
    provider: { type: 'dashscope', baseUrl: 'https://dashscope.aliyuncs.com/api/v1' },
    modelId: 'qwen-plus',
    apiKey: 'runtime-key',
    messages: [{ role: 'user', content: 'Hello' }],
    fetch: async (url, init) => {
      assert.equal(url, 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation');
      assert.equal(new Headers(init.headers).get('x-dashscope-sse'), 'enable');
      return response('data: {"output":{"text":"Qwen"}}\n\n');
    },
  });

  assert.equal(anthropicText, 'Claude');
  assert.equal(geminiText, 'Gemini');
  assert.equal(azureText, 'Azure');
  assert.equal(dashScopeText, 'Qwen');
});
