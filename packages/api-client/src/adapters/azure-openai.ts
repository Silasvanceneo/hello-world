import type { AIModel, ProviderConnection } from '@hello-world/shared';
import { textOnlyModelCapability } from '@hello-world/shared';
import { assertOk, checkedAt, getFetch, joinUrl, toConnectionFailure } from '../http.ts';
import type { ChatRequest, ProviderAdapter, ProviderRuntimeContext } from '../provider-adapter.ts';
import { parseOpenAIStream } from '../streaming/openai-sse.ts';

const DEFAULT_AZURE_API_VERSION = '2025-04-01-preview';

type AzureDeploymentResponse = {
  data?: Array<{ id: string; model?: string }>;
};

function resolveEndpoint(connection: ProviderConnection): { baseUrl: string; apiVersion: string } {
  const raw = connection.baseUrl ?? '';
  if (!raw) {
    return { baseUrl: '', apiVersion: DEFAULT_AZURE_API_VERSION };
  }

  const url = new URL(raw);
  const apiVersion = url.searchParams.get('api-version') ?? DEFAULT_AZURE_API_VERSION;
  url.search = '';
  url.hash = '';
  return { baseUrl: url.toString().replace(/\/$/, ''), apiVersion };
}

function withApiVersion(path: string, apiVersion: string): string {
  return `${path}?api-version=${encodeURIComponent(apiVersion)}`;
}

function buildHeaders(context?: ProviderRuntimeContext): HeadersInit {
  return {
    'content-type': 'application/json',
    ...(context?.apiKey ? { 'api-key': context.apiKey } : {}),
  };
}

export function createAzureOpenAIAdapter(): ProviderAdapter {
  return {
    id: 'azure-openai',
    type: 'azure-openai',
    capabilities: {
      protocol: 'azure-openai',
      transport: 'https',
      browserDirect: 'cors-dependent',
      models: { list: true, dynamicCapabilities: false },
      chat: { streaming: true, systemMessages: true, toolCalls: 'unknown' },
      embeddings: 'supported',
      imageGeneration: 'unknown',
      audioInput: 'unknown',
      audioOutput: 'unknown',
      toolCalls: 'unknown',
    },
    async listModels(connection, context) {
      const { baseUrl, apiVersion } = resolveEndpoint(connection);
      const fetchImpl = getFetch(context);
      const response = await fetchImpl(joinUrl(baseUrl, withApiVersion('/openai/deployments', apiVersion)), {
        method: 'GET',
        headers: buildHeaders(context),
      });
      await assertOk(response, connection.name);
      const body = (await response.json()) as AzureDeploymentResponse;
      return (body.data ?? []).map((deployment): AIModel => ({
        id: deployment.id,
        providerId: connection.id,
        displayName: deployment.model ?? deployment.id,
        ownedBy: 'azure-openai',
        capability: textOnlyModelCapability,
        status: 'available',
      }));
    },
    async *chat(request: ChatRequest, context) {
      const { baseUrl, apiVersion } = resolveEndpoint(request.connection);
      const fetchImpl = getFetch(context);
      const response = await fetchImpl(
        joinUrl(baseUrl, withApiVersion(`/openai/deployments/${encodeURIComponent(request.modelId)}/chat/completions`, apiVersion)),
        {
          method: 'POST',
          headers: buildHeaders(context),
          signal: request.signal,
          body: JSON.stringify({ model: request.modelId, messages: request.messages, stream: true }),
        },
      );
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
