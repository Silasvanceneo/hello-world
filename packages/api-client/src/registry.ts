import type { ProviderConnection } from '@hello-world/shared';
import { createOllamaAdapter } from './adapters/ollama.ts';
import { createOpenAICompatibleAdapter } from './adapters/openai-compatible.ts';
import type { ProviderAdapter, ProviderRuntimeContext } from './provider-adapter.ts';

export type ProviderRegistry = ReadonlyMap<ProviderConnection['type'], ProviderAdapter>;

export function createProviderRegistry(adapters: ProviderAdapter[] = defaultProviderAdapters()): ProviderRegistry {
  return new Map(adapters.map((adapter) => [adapter.type, adapter]));
}

export function defaultProviderAdapters(): ProviderAdapter[] {
  return [createOpenAICompatibleAdapter('openai'), createOpenAICompatibleAdapter('openai-compatible'), createOllamaAdapter()];
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
