import type { AIModel } from '@hello-world/shared';
import { textOnlyModelCapability } from '@hello-world/shared';
import { assertOk, checkedAt, getFetch, joinUrl, toConnectionFailure } from '../http.ts';
import type { ChatRequest, ProviderAdapter } from '../provider-adapter.ts';
import { parseOllamaStream } from '../streaming/ollama-ndjson.ts';

const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434';

type OllamaTagsResponse = {
  models?: Array<{ name: string; model?: string; modified_at?: string }>;
};

function resolveBaseUrl(baseUrl?: string): string {
  return baseUrl ?? DEFAULT_OLLAMA_BASE_URL;
}

export function createOllamaAdapter(): ProviderAdapter {
  return {
    id: 'ollama',
    type: 'ollama',
    capabilities: {
      protocol: 'ollama',
      transport: 'local-http',
      browserDirect: 'supported',
      models: { list: true, dynamicCapabilities: false },
      chat: { streaming: true, systemMessages: true, toolCalls: 'unknown' },
      embeddings: 'unsupported',
      imageGeneration: 'unsupported',
      audioInput: 'unsupported',
      audioOutput: 'unsupported',
      toolCalls: 'unknown',
    },
    async listModels(connection, context) {
      const fetchImpl = getFetch(context);
      const response = await fetchImpl(joinUrl(resolveBaseUrl(connection.baseUrl), '/api/tags'), { method: 'GET' });
      await assertOk(response, connection.name);
      const body = (await response.json()) as OllamaTagsResponse;
      const models = body.models ?? [];

      return models.map((model): AIModel => ({
        id: model.name,
        providerId: connection.id,
        displayName: model.name,
        ownedBy: 'ollama',
        capability: textOnlyModelCapability,
        status: 'available',
      }));
    },
    async *chat(request: ChatRequest, context) {
      const fetchImpl = getFetch(context);
      const response = await fetchImpl(joinUrl(resolveBaseUrl(request.connection.baseUrl), '/api/chat'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: request.signal,
        body: JSON.stringify({ model: request.modelId, messages: request.messages, stream: true }),
      });
      await assertOk(response, request.connection.name);
      yield* parseOllamaStream(response.body);
    },
    async validateConnection(connection, context) {
      try {
        const models = await this.listModels(connection, context);
        return { ok: true, checkedAt: checkedAt(context), models };
      } catch (error) {
        return toConnectionFailure(error, context);
      }
    },
  };
}
