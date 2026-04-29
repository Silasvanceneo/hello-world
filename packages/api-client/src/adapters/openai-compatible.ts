import type { AIModel, ProviderConnection } from '@hello-world/shared';
import { textOnlyModelCapability } from '@hello-world/shared';
import { assertOk, checkedAt, getFetch, joinUrl, toConnectionFailure } from '../http.ts';
import type { ChatRequest, ProviderAdapter, ProviderRuntimeContext } from '../provider-adapter.ts';

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';

type OpenAIModelResponse = {
  data?: Array<{ id: string; owned_by?: string }>;
};

function resolveBaseUrl(connection: ProviderConnection): string {
  return connection.baseUrl ?? DEFAULT_OPENAI_BASE_URL;
}

function buildHeaders(context?: ProviderRuntimeContext): HeadersInit {
  return context?.apiKey
    ? { authorization: `Bearer ${context.apiKey}` }
    : {};
}

export function createOpenAICompatibleAdapter(): ProviderAdapter {
  return {
    id: 'openai-compatible',
    type: 'openai-compatible',
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
    async *chat(_request: ChatRequest) {
      yield { type: 'error' as const, error: { code: 'model' as const, message: 'Chat streaming is implemented in P0-M3.', retryable: false } };
      yield { type: 'done' as const };
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
