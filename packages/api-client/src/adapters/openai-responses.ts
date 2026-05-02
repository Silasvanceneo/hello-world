import type { AIModel, ProviderConnection } from '@hello-world/shared';
import { textOnlyModelCapability } from '@hello-world/shared';
import { assertOk, checkedAt, getFetch, joinUrl, toConnectionFailure } from '../http.ts';
import type { ChatRequest, ProviderAdapter, ProviderRuntimeContext } from '../provider-adapter.ts';
import { parseOpenAIResponsesStream } from '../streaming/openai-responses-sse.ts';

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';

type OpenAIModelResponse = {
  data?: Array<{ id: string; owned_by?: string }>;
};

function resolveBaseUrl(connection: ProviderConnection): string {
  return connection.baseUrl ?? DEFAULT_OPENAI_BASE_URL;
}

function buildHeaders(context?: ProviderRuntimeContext): HeadersInit {
  return {
    'content-type': 'application/json',
    ...(context?.apiKey ? { authorization: `Bearer ${context.apiKey}` } : {}),
  };
}

export function createOpenAIResponsesAdapter(): ProviderAdapter {
  return {
    id: 'openai-responses',
    type: 'openai',
    capabilities: {
      protocol: 'openai-responses',
      transport: 'https',
      browserDirect: 'cors-dependent',
      models: { list: true, dynamicCapabilities: false },
      chat: { streaming: true, systemMessages: true, toolCalls: 'unknown' },
      embeddings: 'supported',
      imageGeneration: 'supported',
      audioInput: 'supported',
      audioOutput: 'supported',
      toolCalls: 'unknown',
    },
    async listModels(connection, context) {
      const fetchImpl = getFetch(context);
      const response = await fetchImpl(joinUrl(resolveBaseUrl(connection), '/models'), {
        method: 'GET',
        headers: buildHeaders(context),
      });
      await assertOk(response, connection.name);
      const body = (await response.json()) as OpenAIModelResponse;
      return (body.data ?? []).map((model): AIModel => ({
        id: model.id,
        providerId: connection.id,
        displayName: model.id,
        ownedBy: model.owned_by,
        capability: textOnlyModelCapability,
        status: 'available',
      }));
    },
    async *chat(request: ChatRequest, context) {
      const fetchImpl = getFetch(context);
      const response = await fetchImpl(joinUrl(resolveBaseUrl(request.connection), '/responses'), {
        method: 'POST',
        headers: buildHeaders(context),
        signal: request.signal,
        body: JSON.stringify({ model: request.modelId, input: request.messages, stream: true }),
      });
      await assertOk(response, request.connection.name);
      yield* parseOpenAIResponsesStream(response.body);
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
