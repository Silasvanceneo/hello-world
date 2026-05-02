import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAnthropicMessagesAdapter,
  createAzureOpenAIAdapter,
  createDashScopeNativeAdapter,
  createGeminiNativeAdapter,
  createOpenAIResponsesAdapter,
  createProviderRegistry,
  listProviderCapabilities,
  validateProviderConnection,
} from '../packages/api-client/src/index.ts';
import type { ChatChunk, ProviderConnection } from '@hello-world/shared';

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });
}

function sseResponse(events: string, init: ResponseInit = {}) {
  return new Response(events, { status: 200, headers: { 'content-type': 'text/event-stream' }, ...init });
}

async function collectChunks(chunks: AsyncIterable<ChatChunk>) {
  const collected: ChatChunk[] = [];
  for await (const chunk of chunks) {
    collected.push(chunk);
  }
  return collected;
}

function connection(type: ProviderConnection['type'], baseUrl?: string): ProviderConnection {
  return {
    id: `${type}-1`,
    type,
    name: type,
    baseUrl,
    apiKeyRef: 'secret-ref',
    enabled: true,
    createdAt: '2026-05-02T12:00:00.000Z',
    updatedAt: '2026-05-02T12:00:00.000Z',
  };
}

test('OpenAI Responses adapter lists models, posts to /responses, and streams output text deltas', async () => {
  const adapter = createOpenAIResponsesAdapter();
  const requests: Array<{ url: string; init: RequestInit }> = [];

  const models = await adapter.listModels(connection('openai'), {
    apiKey: 'runtime-key',
    fetch: async (url, init) => {
      requests.push({ url: String(url), init: init ?? {} });
      return jsonResponse({ data: [{ id: 'gpt-4.1-mini', owned_by: 'openai' }] });
    },
  });
  const chunks = await collectChunks(adapter.chat({
    connection: connection('openai'),
    modelId: 'gpt-4.1-mini',
    messages: [{ role: 'system', content: 'Be terse.' }, { role: 'user', content: 'Hi' }],
  }, {
    apiKey: 'runtime-key',
    fetch: async (url, init) => {
      requests.push({ url: String(url), init: init ?? {} });
      return sseResponse([
        'event: response.output_text.delta',
        'data: {"type":"response.output_text.delta","delta":"Hello"}',
        '',
        'event: response.output_text.done',
        'data: {"type":"response.output_text.done"}',
        '',
      ].join('\n'));
    },
  }));

  assert.equal(models[0]?.id, 'gpt-4.1-mini');
  assert.equal(requests[0]?.url, 'https://api.openai.com/v1/models');
  assert.equal(new Headers(requests[0]?.init.headers).get('authorization'), 'Bearer runtime-key');
  assert.equal(requests[1]?.url, 'https://api.openai.com/v1/responses');
  assert.equal(JSON.parse(String(requests[1]?.init.body)).input[0].role, 'system');
  assert.deepEqual(chunks.filter((chunk) => chunk.type === 'text-delta').map((chunk) => chunk.text), ['Hello']);
});

test('Anthropic Messages adapter sends native headers and streams content block deltas', async () => {
  const adapter = createAnthropicMessagesAdapter();
  let chatBody: Record<string, unknown> = {};
  let headers = new Headers();

  const chunks = await collectChunks(adapter.chat({
    connection: connection('anthropic'),
    modelId: 'claude-sonnet-4-5',
    messages: [{ role: 'system', content: 'Use short sentences.' }, { role: 'user', content: 'Hi' }],
  }, {
    apiKey: 'runtime-key',
    fetch: async (_url, init) => {
      headers = new Headers(init?.headers);
      chatBody = JSON.parse(String(init?.body));
      return sseResponse([
        'event: content_block_delta',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}',
        '',
        'event: message_delta',
        'data: {"type":"message_delta","usage":{"output_tokens":7}}',
        '',
      ].join('\n'));
    },
  }));

  assert.equal(headers.get('x-api-key'), 'runtime-key');
  assert.equal(headers.get('anthropic-version'), '2023-06-01');
  assert.equal(chatBody.system, 'Use short sentences.');
  assert.equal(chatBody.stream, true);
  assert.deepEqual(chunks.filter((chunk) => chunk.type === 'text-delta').map((chunk) => chunk.text), ['Hello']);
  assert.deepEqual(chunks.filter((chunk) => chunk.type === 'usage').map((chunk) => chunk.usage.completionTokens), [7]);
});

test('Gemini native adapter lists models, uses x-goog-api-key, and streams candidate text', async () => {
  const adapter = createGeminiNativeAdapter();
  const seen: Array<{ url: string; headers: Headers; body?: Record<string, unknown> }> = [];

  const models = await adapter.listModels(connection('gemini'), {
    apiKey: 'runtime-key',
    fetch: async (url, init) => {
      seen.push({ url: String(url), headers: new Headers(init?.headers) });
      return jsonResponse({ models: [{ name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' }] });
    },
  });
  const chunks = await collectChunks(adapter.chat({
    connection: connection('gemini'),
    modelId: 'gemini-2.5-flash',
    messages: [{ role: 'system', content: 'Be brief.' }, { role: 'assistant', content: 'Ready.' }, { role: 'user', content: 'Hi' }],
  }, {
    apiKey: 'runtime-key',
    fetch: async (url, init) => {
      seen.push({ url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
      return sseResponse([
        'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}',
        '',
      ].join('\n'));
    },
  }));

  assert.deepEqual(models.map((model) => model.id), ['gemini-2.5-flash']);
  assert.equal(seen[0]?.url, 'https://generativelanguage.googleapis.com/v1beta/models');
  assert.equal(seen[0]?.headers.get('x-goog-api-key'), 'runtime-key');
  assert.equal(seen[1]?.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse');
  assert.equal(seen[1]?.headers.get('x-goog-api-key'), 'runtime-key');
  assert.equal(Array.isArray(seen[1]?.body?.contents), true);
  assert.deepEqual(chunks.filter((chunk) => chunk.type === 'text-delta').map((chunk) => chunk.text), ['Hello']);
});

test('Azure OpenAI adapter uses deployment and api-version URL shape without persisting secrets', async () => {
  const adapter = createAzureOpenAIAdapter();
  const requests: Array<{ url: string; headers: Headers; body?: Record<string, unknown> }> = [];
  const azure = connection('azure-openai', 'https://example-resource.openai.azure.com?api-version=2025-04-01-preview');

  const chunks = await collectChunks(adapter.chat({
    connection: azure,
    modelId: 'gpt-4.1-mini',
    messages: [{ role: 'user', content: 'Hi' }],
  }, {
    apiKey: 'runtime-key',
    fetch: async (url, init) => {
      requests.push({ url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
      return sseResponse('data: {"choices":[{"delta":{"content":"Azure"}}]}\n\n');
    },
  }));

  assert.equal(requests[0]?.url, 'https://example-resource.openai.azure.com/openai/deployments/gpt-4.1-mini/chat/completions?api-version=2025-04-01-preview');
  assert.equal(requests[0]?.headers.get('api-key'), 'runtime-key');
  assert.equal(requests[0]?.headers.get('authorization'), null);
  assert.equal(requests[0]?.body?.stream, true);
  assert.deepEqual(chunks.filter((chunk) => chunk.type === 'text-delta').map((chunk) => chunk.text), ['Azure']);
});

test('DashScope native adapter uses Bearer auth and streams Qwen text output', async () => {
  const adapter = createDashScopeNativeAdapter();
  let requestUrl = '';
  let headers = new Headers();
  let body: Record<string, unknown> = {};

  const chunks = await collectChunks(adapter.chat({
    connection: connection('dashscope'),
    modelId: 'qwen-plus',
    messages: [{ role: 'user', content: 'Hi' }],
  }, {
    apiKey: 'runtime-key',
    fetch: async (url, init) => {
      requestUrl = String(url);
      headers = new Headers(init?.headers);
      body = JSON.parse(String(init?.body));
      return sseResponse([
        'data: {"output":{"text":"Ni hao"}}',
        '',
        'data: [DONE]',
        '',
      ].join('\n'));
    },
  }));

  assert.equal(requestUrl, 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation');
  assert.equal(headers.get('authorization'), 'Bearer runtime-key');
  assert.equal(headers.get('x-dashscope-sse'), 'enable');
  assert.equal(body.model, 'qwen-plus');
  assert.deepEqual(chunks.filter((chunk) => chunk.type === 'text-delta').map((chunk) => chunk.text), ['Ni hao']);
});

test('native provider validation classifies auth, model, and network failures', async () => {
  const adapter = createAnthropicMessagesAdapter();
  const authStatus = await adapter.validateConnection(connection('anthropic'), {
    now: () => '2026-05-02T12:00:00.000Z',
    fetch: async () => jsonResponse({ error: { message: 'bad key' } }, { status: 401, statusText: 'Unauthorized' }),
  });
  const modelStatus = await adapter.validateConnection(connection('anthropic'), {
    now: () => '2026-05-02T12:00:00.000Z',
    fetch: async () => jsonResponse({ error: { message: 'missing model' } }, { status: 404, statusText: 'Not Found' }),
  });
  const networkStatus = await adapter.validateConnection(connection('anthropic'), {
    now: () => '2026-05-02T12:00:00.000Z',
    fetch: async () => {
      throw new TypeError('failed to fetch');
    },
  });

  assert.equal(authStatus.ok, false);
  assert.equal(modelStatus.ok, false);
  assert.equal(networkStatus.ok, false);
  if (!authStatus.ok) assert.equal(authStatus.reason, 'auth');
  if (!modelStatus.ok) assert.equal(modelStatus.reason, 'model');
  if (!networkStatus.ok) assert.equal(networkStatus.reason, 'network');
});

test('default registry exposes native provider capability summaries', () => {
  const capabilities = listProviderCapabilities(createProviderRegistry());
  const protocols = new Map(capabilities.map((item) => [item.providerType, item.protocol]));

  assert.equal(protocols.get('openai'), 'openai-responses');
  assert.equal(protocols.get('anthropic'), 'anthropic-messages');
  assert.equal(protocols.get('gemini'), 'gemini-native');
  assert.equal(protocols.get('azure-openai'), 'azure-openai');
  assert.equal(protocols.get('dashscope'), 'dashscope-native');
});

test('registry validates native providers through their registered adapter', async () => {
  const registry = createProviderRegistry();
  const status = await validateProviderConnection(registry, connection('gemini'), {
    now: () => '2026-05-02T12:00:00.000Z',
    apiKey: 'runtime-key',
    fetch: async () => jsonResponse({ models: [{ name: 'models/gemini-2.5-flash' }] }),
  });

  assert.equal(status.ok, true);
  if (status.ok) {
    assert.equal(status.models?.[0]?.id, 'gemini-2.5-flash');
  }
});
