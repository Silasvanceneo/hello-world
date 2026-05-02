import type { AIModel, ProviderConnection } from '@hello-world/shared';
import { textOnlyModelCapability } from '@hello-world/shared';
import { assertOk, checkedAt, getFetch, joinUrl, toConnectionFailure } from '../http.ts';
import { splitSystemAndMessages } from '../messages.ts';
import type { ChatRequest, ProviderAdapter, ProviderRuntimeContext } from '../provider-adapter.ts';
import { parseAnthropicStream } from '../streaming/anthropic-sse.ts';

const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';
const ANTHROPIC_VERSION = '2023-06-01';

type AnthropicModelResponse = {
  data?: Array<{ id: string; display_name?: string }>;
};

function resolveBaseUrl(connection: ProviderConnection): string {
  return connection.baseUrl ?? DEFAULT_ANTHROPIC_BASE_URL;
}

function buildHeaders(context?: ProviderRuntimeContext): HeadersInit {
  return {
    'content-type': 'application/json',
    'anthropic-version': ANTHROPIC_VERSION,
    ...(context?.apiKey ? { 'x-api-key': context.apiKey } : {}),
  };
}

export function createAnthropicMessagesAdapter(): ProviderAdapter {
  return {
    id: 'anthropic-messages',
    type: 'anthropic',
    capabilities: {
      protocol: 'anthropic-messages',
      transport: 'https',
      browserDirect: 'cors-dependent',
      models: { list: true, dynamicCapabilities: false },
      chat: { streaming: true, systemMessages: true, toolCalls: 'unknown' },
      embeddings: 'unsupported',
      imageGeneration: 'unsupported',
      audioInput: 'unknown',
      audioOutput: 'unsupported',
      toolCalls: 'unknown',
    },
    async listModels(connection, context) {
      const fetchImpl = getFetch(context);
      const response = await fetchImpl(joinUrl(resolveBaseUrl(connection), '/models'), {
        method: 'GET',
        headers: buildHeaders(context),
      });
      await assertOk(response, connection.name);
      const body = (await response.json()) as AnthropicModelResponse;
      return (body.data ?? []).map((model): AIModel => ({
        id: model.id,
        providerId: connection.id,
        displayName: model.display_name ?? model.id,
        ownedBy: 'anthropic',
        capability: textOnlyModelCapability,
        status: 'available',
      }));
    },
    async *chat(request: ChatRequest, context) {
      const fetchImpl = getFetch(context);
      const normalized = splitSystemAndMessages(request.messages);
      const response = await fetchImpl(joinUrl(resolveBaseUrl(request.connection), '/messages'), {
        method: 'POST',
        headers: buildHeaders(context),
        signal: request.signal,
        body: JSON.stringify({
          model: request.modelId,
          max_tokens: 4096,
          messages: normalized.messages,
          system: normalized.system,
          stream: true,
        }),
      });
      await assertOk(response, request.connection.name);
      yield* parseAnthropicStream(response.body);
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
