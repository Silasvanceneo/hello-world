import type { AIModel } from '@hello-world/shared';
import { textOnlyModelCapability } from '@hello-world/shared';
import { assertOk, checkedAt, getFetch, joinUrl, toConnectionFailure } from '../http.ts';
import type { ChatRequest, ProviderAdapter } from '../provider-adapter.ts';

const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434';

type OllamaTagsResponse = {
  models?: Array<{ name: string; model?: string; modified_at?: string }>;
};

export function createOllamaAdapter(): ProviderAdapter {
  return {
    id: 'ollama',
    type: 'ollama',
    async listModels(connection, context) {
      const fetchImpl = getFetch(context);
      const baseUrl = connection.baseUrl ?? DEFAULT_OLLAMA_BASE_URL;
      const response = await fetchImpl(joinUrl(baseUrl, '/api/tags'), { method: 'GET' });
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
