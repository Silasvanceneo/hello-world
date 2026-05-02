import type { ProviderCapabilitySummary, ProviderConnection } from '@hello-world/shared';
import { createAnthropicMessagesAdapter } from './adapters/anthropic-messages.ts';
import { createAzureOpenAIAdapter } from './adapters/azure-openai.ts';
import { createDashScopeNativeAdapter } from './adapters/dashscope-native.ts';
import { createGeminiNativeAdapter } from './adapters/gemini-native.ts';
import { createOllamaAdapter } from './adapters/ollama.ts';
import { createOpenAICompatibleAdapter } from './adapters/openai-compatible.ts';
import { createOpenAIResponsesAdapter } from './adapters/openai-responses.ts';
import type { ProviderAdapter, ProviderRuntimeContext } from './provider-adapter.ts';

export type ProviderRegistry = ReadonlyMap<ProviderConnection['type'], ProviderAdapter>;

export function createProviderRegistry(adapters: ProviderAdapter[] = defaultProviderAdapters()): ProviderRegistry {
  return new Map(adapters.map((adapter) => [adapter.type, adapter]));
}

export function defaultProviderAdapters(): ProviderAdapter[] {
  return [
    createOpenAIResponsesAdapter(),
    createOpenAICompatibleAdapter('openai-compatible'),
    createAnthropicMessagesAdapter(),
    createGeminiNativeAdapter(),
    createAzureOpenAIAdapter(),
    createDashScopeNativeAdapter(),
    createOllamaAdapter(),
  ];
}

export function getProviderAdapter(registry: ProviderRegistry, connection: ProviderConnection): ProviderAdapter {
  const adapter = registry.get(connection.type);
  if (!adapter) {
    throw new Error(`No provider adapter registered for type: ${connection.type}`);
  }
  return adapter;
}

export async function validateProviderConnection(
  registry: ProviderRegistry,
  connection: ProviderConnection,
  context?: ProviderRuntimeContext,
) {
  return getProviderAdapter(registry, connection).validateConnection(connection, context);
}

export async function listProviderModels(
  registry: ProviderRegistry,
  connection: ProviderConnection,
  context?: ProviderRuntimeContext,
) {
  return getProviderAdapter(registry, connection).listModels(connection, context);
}

export function getProviderCapabilities(
  registry: ProviderRegistry,
  connection: ProviderConnection,
  _context?: ProviderRuntimeContext,
): ProviderCapabilitySummary {
  return summarizeAdapterCapabilities(getProviderAdapter(registry, connection));
}

export function listProviderCapabilities(registry: ProviderRegistry): ProviderCapabilitySummary[] {
  return Array.from(registry.values()).map((adapter) => summarizeAdapterCapabilities(adapter));
}

function summarizeAdapterCapabilities(adapter: ProviderAdapter): ProviderCapabilitySummary {
  return {
    providerType: adapter.type,
    adapterId: adapter.id,
    protocol: adapter.capabilities.protocol,
    transport: adapter.capabilities.transport,
    browserDirect: adapter.capabilities.browserDirect,
    features: {
      modelListing: adapter.capabilities.models.list,
      chatStreaming: adapter.capabilities.chat.streaming,
      embeddings: adapter.capabilities.embeddings,
      imageGeneration: adapter.capabilities.imageGeneration,
      audioInput: adapter.capabilities.audioInput,
      audioOutput: adapter.capabilities.audioOutput,
      toolCalls: adapter.capabilities.toolCalls,
    },
  };
}
