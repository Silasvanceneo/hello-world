import type { ProviderConnection, ProviderConnectionDraft } from '@hello-world/shared';

export type ProviderStore = {
  connections: ProviderConnection[];
  activeConnectionId?: string;
};

export type ProviderStoreContext = {
  now?: () => string;
  createId?: () => string;
};

export function createEmptyProviderStore(): ProviderStore {
  return { connections: [] };
}

export function createProviderConnection(
  draft: ProviderConnectionDraft,
  context: ProviderStoreContext = {},
): ProviderConnection {
  const timestamp = context.now?.() ?? new Date().toISOString();
  const id = context.createId?.() ?? crypto.randomUUID();

  return {
    id,
    type: draft.type,
    name: draft.name.trim(),
    baseUrl: normalizeOptionalString(draft.baseUrl),
    apiKeyRef: normalizeOptionalString(draft.apiKeyRef),
    enabled: draft.enabled ?? true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function addProviderConnection(store: ProviderStore, connection: ProviderConnection): ProviderStore {
  return {
    ...store,
    connections: [connection, ...store.connections],
    activeConnectionId: store.activeConnectionId ?? connection.id,
  };
}

export function updateProviderConnection(
  store: ProviderStore,
  connectionId: string,
  patch: Partial<Omit<ProviderConnection, 'id' | 'createdAt'>>,
  context: ProviderStoreContext = {},
): ProviderStore {
  const updatedAt = context.now?.() ?? new Date().toISOString();
  const connections = store.connections.map((connection) => {
    if (connection.id !== connectionId) {
      return connection;
    }

    return {
      ...connection,
      ...patch,
      name: patch.name?.trim() ?? connection.name,
      baseUrl: patch.baseUrl === undefined ? connection.baseUrl : normalizeOptionalString(patch.baseUrl),
      apiKeyRef: patch.apiKeyRef === undefined ? connection.apiKeyRef : normalizeOptionalString(patch.apiKeyRef),
      updatedAt,
    };
  });

  return { ...store, connections };
}

export function deleteProviderConnection(store: ProviderStore, connectionId: string): ProviderStore {
  const connections = store.connections.filter((connection) => connection.id !== connectionId);
  const activeConnectionId = store.activeConnectionId === connectionId ? connections[0]?.id : store.activeConnectionId;

  return { ...store, connections, activeConnectionId };
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
