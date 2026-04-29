import assert from 'node:assert/strict';
import test from 'node:test';
import { createOllamaAdapter, createOpenAICompatibleAdapter, parseOpenAIStream, type ProviderAdapter } from '../packages/api-client/src/index.ts';
import { editUserMessage, prepareRetryLastAssistant, sendChatMessage } from '../packages/core/src/chat/chat-engine.ts';
import type { ChatSession, ProviderConnection } from '@hello-world/shared';

function streamResponse(text: string) {
  return new Response(text, { headers: { 'content-type': 'text/event-stream' } });
}

function createSession(): ChatSession {
  return {
    id: 'session-1',
    title: 'Test',
    messages: [],
    tags: [],
    createdAt: '2026-04-29T00:00:00.000Z',
    updatedAt: '2026-04-29T00:00:00.000Z',
    syncState: 'local',
  };
}

const connection: ProviderConnection = {
  id: 'provider-1',
  type: 'openai-compatible',
  name: 'Provider',
  enabled: true,
  createdAt: '2026-04-29T00:00:00.000Z',
  updatedAt: '2026-04-29T00:00:00.000Z',
};

test('OpenAI SSE parser emits text deltas and usage', async () => {
  const response = streamResponse([
    'data: {"choices":[{"delta":{"content":"Hello"}}]}',
    '',
    'data: {"choices":[{"delta":{"content":" world"}}],"usage":{"prompt_tokens":2,"completion_tokens":3,"total_tokens":5}}',
    '',
    'data: [DONE]',
    '',
  ].join('\n'));

  const chunks = [];
  for await (const chunk of parseOpenAIStream(response.body)) {
    chunks.push(chunk);
  }

  assert.equal(chunks.filter((chunk) => chunk.type === 'text-delta').map((chunk) => chunk.text).join(''), 'Hello world');
  assert.equal(chunks.find((chunk) => chunk.type === 'usage')?.usage.totalTokens, 5);
});

test('OpenAI-compatible chat adapter streams normalized chunks', async () => {
  const adapter = createOpenAICompatibleAdapter();
  const chunks = [];
  for await (const chunk of adapter.chat(
    { connection, modelId: 'gpt-test', messages: [{ role: 'user', content: 'Hi' }] },
    { fetch: async () => streamResponse('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\ndata: [DONE]\n\n') },
  )) {
    chunks.push(chunk);
  }

  assert.equal(chunks[0]?.type, 'text-delta');
  assert.equal(chunks.at(-1)?.type, 'done');
});

test('Ollama chat adapter streams normalized chunks', async () => {
  const adapter = createOllamaAdapter();
  const chunks = [];
  for await (const chunk of adapter.chat(
    { connection: { ...connection, type: 'ollama' }, modelId: 'llama3.2', messages: [{ role: 'user', content: 'Hi' }] },
    { fetch: async () => new Response('{"message":{"content":"Hi"}}\n{"done":true,"prompt_eval_count":1,"eval_count":2}\n') },
  )) {
    chunks.push(chunk);
  }

  assert.equal(chunks.filter((chunk) => chunk.type === 'text-delta').map((chunk) => chunk.text).join(''), 'Hi');
  assert.equal(chunks.find((chunk) => chunk.type === 'usage')?.usage.totalTokens, 3);
});

test('chat engine sends a user message, collects assistant text, and supports retry/edit', async () => {
  const adapter: ProviderAdapter = {
    id: 'mock',
    type: 'custom',
    async listModels() { return []; },
    async validateConnection() { return { ok: true, checkedAt: '2026-04-29T00:00:00.000Z', models: [] }; },
    async *chat() {
      yield { type: 'text-delta', text: 'Hello' };
      yield { type: 'text-delta', text: '!' };
      yield { type: 'usage', usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 } };
      yield { type: 'done' };
    },
  };
  let id = 0;
  const result = await sendChatMessage({
    session: createSession(),
    adapter,
    connection: { ...connection, type: 'custom' },
    modelId: 'mock-model',
    text: 'Say hello',
    context: { now: () => '2026-04-29T00:00:00.000Z', createId: () => `msg-${++id}` },
  });

  assert.equal(result.session.messages.length, 2);
  assert.equal(result.session.messages[1]?.content[0]?.type, 'text');
  assert.equal(result.session.messages[1]?.usage?.totalTokens, 3);

  const retrySession = prepareRetryLastAssistant(result.session, { now: () => '2026-04-29T01:00:00.000Z' });
  assert.equal(retrySession.messages.length, 1);

  const edited = editUserMessage(result.session, 'msg-1', 'Say hi again', { now: () => '2026-04-29T02:00:00.000Z' });
  assert.equal(edited.messages.length, 1);
  assert.deepEqual(edited.messages[0]?.content, [{ type: 'text', text: 'Say hi again' }]);
});
