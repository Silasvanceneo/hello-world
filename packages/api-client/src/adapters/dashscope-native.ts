import type { AIModel, ProviderConnection } from '@hello-world/shared';
import { textOnlyModelCapability } from '@hello-world/shared';
import { assertOk, checkedAt, getFetch, joinUrl, toConnectionFailure } from '../http.ts';
import type { ChatRequest, ProviderAdapter, ProviderRuntimeContext } from '../provider-adapter.ts';
import { parseDashScopeStream } from '../streaming/dashscope-sse.ts';

const DEFAULT_DASHSCOPE_BASE_URL = 'https://dashscope.aliyuncs.com/api/v1';

type DashScopeModelResponse = {
  data?: Array<{ id: string; name?: string }>;
  models?: Array<{ id?: string; name?: string }>;
};

function resolveBaseUrl(connection: ProviderConnection): string {
  return connection.baseUrl ?? DEFAULT_DASHSCOPE_BASE_URL;
}

function buildHeaders(context?: ProviderRuntimeContext): HeadersInit {
  return {
    'content-type': 'application/json',
    'x-dashscope-sse': 'enable',
    ...(context?.apiKey ? { authorization: `Bearer ${context.apiKey}` } : {}),
  };
}

function toMessages(messages: ChatRequest['messages']) {
  return messages.map((message) => ({ role: message.role, content: message.content }));
}

export function createDashScopeNativeAdapter(): ProviderAdapter {
  return {
    id: 'dashscope-native',
    type: 'dashscope',
    capabilities: {
      protocol: 'dashscope-native',
      transport: 'https',
      browserDirect: 'cors-dependent',
      models: { list: true, dynamicCapabilities: false },
      chat: { streaming: true, systemMessages: true, toolCalls: 'unknown' },
      embeddings: 'supported',
      imageGeneration: 'supported',
      audioInput: 'unknown',
      audioOutput: 'unknown',
      toolCalls: 'unknown',
    },
    async listModels(connection, context) {
      const fetchImpl = getFetch(context);
      const response = await fetchImpl(joinUrl(resolveBaseUrl(connection), '/services/aigc/text-generation/models'), {
        method: 'GET',
        headers: buildHeaders(context),
      });
      await assertOk(response, connection.name);
      const body = (await response.json()) as DashScopeModelResponse;
      const models = body.data ?? body.models ?? [];
      return models.map((model): AIModel => {
        const id = model.id ?? model.name ?? 'qwen-plus';
        return {
          id,
          providerId: connection.id,
          displayName: model.name ?? id,
          ownedBy: 'alibaba-dashscope',
          capability: textOnlyModelCapability,
          status: 'available',
        };
      });
    },
    async *chat(request: ChatRequest, context) {
      const fetchImpl = getFetch(context);
      const response = await fetchImpl(joinUrl(resolveBaseUrl(request.connection), '/services/aigc/text-generation/generation'), {
        method: 'POST',
        headers: buildHeaders(context),
        signal: request.signal,
        body: JSON.stringify({
          model: request.modelId,
          input: { messages: toMessages(request.messages) },
          parameters: { incremental_output: true },
        }),
      });
      await assertOk(response, request.connection.name);
      yield* parseDashScopeStream(response.body);
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
