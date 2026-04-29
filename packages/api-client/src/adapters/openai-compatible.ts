import type { AIModel, ProviderConnection } from '@hello-world/shared';
import { textOnlyModelCapability } from '@hello-world/shared';
import { assertOk, checkedAt, getFetch, joinUrl, toConnectionFailure } from '../http.ts';
import type { ChatRequest, ProviderAdapter, ProviderRuntimeContext } from '../provider-adapter.ts';
import { parseOpenAIStream } from '../streaming/openai-sse.ts';

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';

type OpenAIModelResponse = {
  data?: Array<{ id: string; owned_by?: string }>;
};

function resolveBaseUrl(connection: ProviderConnection): string {
  return connection.baseUrl ?? DEFAULT_OPENAI_BASE_URL;
}

function buildHeaders(context?: ProviderRuntimeContext): HeadersInit {
  const authHeaders = context?.apiKey ? { authorization: `Bearer ${context.apiKey}` } : {};
  return { 'content-type': 'application/json', ...authHeaders };
}

export function createOpenAICompatibleAdapter(type: ProviderConnection['type'] = 'openai-compatible'): ProviderAdapter {
  return {
    id: type,
    type,
    async listModels(connection, context) {
      const fetchImpl = getFetch(context);
      const response = await fetchImpl(joinUrl(resolveBaseUrl(connection), '/models'), {
        method: 'GET',
        headers: buildHeaders(context),
      });
      await assertOk(response, connection.name);
      const body = (await response.json()) as OpenAIModelResponse;
      const models = body.data ?? [];

      return models.map((model) => ({
        id: model.id,
        providerId: connection.id,
        displayName: model.id,
        ownedBy: model.owned_by,
        capability: textOnlyModelCapability,
        status: 'available' as const,
      }));
    },
    async *chat(request: ChatRequest, context) {
      const fetchImpl = getFetch(context);
      const response = await fetchImpl(joinUrl(resolveBaseUrl(request.connection), '/chat/completions'), {
        method: 'POST',
        headers: buildHeaders(context),
        signal: request.signal,
        body: JSON.stringify({ model: request.modelId, messages: request.messages, stream: true }),
      });
      await assertOk(response, request.connection.name);
      yield* parseOpenAIStream(response.body);
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
