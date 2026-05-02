import type { AIModel, ProviderConnection } from '@hello-world/shared';
import { textOnlyModelCapability } from '@hello-world/shared';
import { assertOk, checkedAt, getFetch, joinUrl, toConnectionFailure } from '../http.ts';
import type { ChatRequest, ProviderAdapter, ProviderRuntimeContext } from '../provider-adapter.ts';
import { parseGeminiStream } from '../streaming/gemini-sse.ts';

const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

type GeminiModelResponse = {
  models?: Array<{ name: string; displayName?: string }>;
};

function resolveBaseUrl(connection: ProviderConnection): string {
  return connection.baseUrl ?? DEFAULT_GEMINI_BASE_URL;
}

function buildHeaders(context?: ProviderRuntimeContext): HeadersInit {
  return {
    'content-type': 'application/json',
    ...(context?.apiKey ? { 'x-goog-api-key': context.apiKey } : {}),
  };
}

function normalizeModelId(modelId: string): string {
  return modelId.startsWith('models/') ? modelId.slice('models/'.length) : modelId;
}

function toContents(messages: ChatRequest['messages']) {
  const system = messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n\n');
  const contents = messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    }));

  return {
    contents,
    systemInstruction: system ? { parts: [{ text: system }] } : undefined,
  };
}

export function createGeminiNativeAdapter(): ProviderAdapter {
  return {
    id: 'gemini-native',
    type: 'gemini',
    capabilities: {
      protocol: 'gemini-native',
      transport: 'https',
      browserDirect: 'cors-dependent',
      models: { list: true, dynamicCapabilities: false },
      chat: { streaming: true, systemMessages: true, toolCalls: 'unknown' },
      embeddings: 'supported',
      imageGeneration: 'supported',
      audioInput: 'supported',
      audioOutput: 'unknown',
      toolCalls: 'unknown',
    },
    async listModels(connection, context) {
      const fetchImpl = getFetch(context);
      const response = await fetchImpl(joinUrl(resolveBaseUrl(connection), '/models'), {
        method: 'GET',
        headers: buildHeaders(context),
      });
      await assertOk(response, connection.name);
      const body = (await response.json()) as GeminiModelResponse;
      return (body.models ?? []).map((model): AIModel => ({
        id: normalizeModelId(model.name),
        providerId: connection.id,
        displayName: model.displayName ?? normalizeModelId(model.name),
        ownedBy: 'google',
        capability: textOnlyModelCapability,
        status: 'available',
      }));
    },
    async *chat(request: ChatRequest, context) {
      const fetchImpl = getFetch(context);
      const body = toContents(request.messages);
      const response = await fetchImpl(joinUrl(resolveBaseUrl(request.connection), `/models/${normalizeModelId(request.modelId)}:streamGenerateContent?alt=sse`), {
        method: 'POST',
        headers: buildHeaders(context),
        signal: request.signal,
        body: JSON.stringify(body),
      });
      await assertOk(response, request.connection.name);
      yield* parseGeminiStream(response.body);
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
