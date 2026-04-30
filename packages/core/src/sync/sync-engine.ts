import type {
  AgentPreset,
  AppSettings,
  ChatSession,
  KnowledgeDocument,
  PromptTemplate,
  ProviderConnection,
  SyncState,
} from '@hello-world/shared';

export type SyncTarget = 'session' | 'settings' | 'provider' | 'agent' | 'prompt' | 'knowledge';

export type LocalSyncItem = {
  key: string;
  target: SyncTarget;
  updatedAt: string;
  syncState: SyncState;
  payload: Record<string, unknown>;
};

export type RemoteSyncItem = {
  key: string;
  target: SyncTarget;
  updatedAt: string;
  revision?: string;
  payload: Record<string, unknown>;
};

export type SyncConflict = {
  key: string;
  target: SyncTarget;
  local: LocalSyncItem;
  remote: RemoteSyncItem;
  reason: string;
};

export type SyncPlan = {
  upload: LocalSyncItem[];
  download: RemoteSyncItem[];
  conflicts: SyncConflict[];
  checkedAt: string;
  safeToAutoApply: boolean;
};

export type CollectSyncItemsInput = {
  sessions?: ChatSession[];
  settings?: AppSettings;
  providerConnections?: ProviderConnection[];
  agentPresets?: AgentPreset[];
  promptTemplates?: PromptTemplate[];
  knowledgeDocuments?: KnowledgeDocument[];
};

export type CreateSyncPlanOptions = {
  now?: string;
};

export type SyncConflictResolution = 'keep-local' | 'use-remote';

export function collectSyncItems(input: CollectSyncItemsInput): LocalSyncItem[] {
  return [
    ...(input.agentPresets ?? []).map((preset) => localItem('agent', preset.id, preset.updatedAt, 'dirty', preset)),
    ...(input.knowledgeDocuments ?? []).map((document) => localItem(
      'knowledge',
      document.id,
      document.updatedAt,
      'dirty',
      knowledgeMetadata(document),
    )),
    ...(input.promptTemplates ?? []).map((template) => localItem('prompt', template.id, template.updatedAt, 'dirty', template)),
    ...(input.providerConnections ?? []).map((provider) => localItem('provider', provider.id, provider.updatedAt, 'dirty', provider)),
    ...(input.sessions ?? []).map((session) => localItem('session', session.id, session.updatedAt, session.syncState, session)),
    ...(input.settings ? [localItem('settings', 'app', input.settings.updatedAt, 'dirty', input.settings)] : []),
  ].sort(byKey);
}

export function createSyncPlan(
  localItems: LocalSyncItem[],
  remoteItems: RemoteSyncItem[],
  options: CreateSyncPlanOptions = {},
): SyncPlan {
  const remoteByKey = new Map(remoteItems.map((item) => [item.key, item]));
  const localByKey = new Set(localItems.map((item) => item.key));
  const upload: LocalSyncItem[] = [];
  const download: RemoteSyncItem[] = [];
  const conflicts: SyncConflict[] = [];

  for (const local of localItems) {
    const remote = remoteByKey.get(local.key);
    if (!remote) {
      if (hasPendingLocalChange(local)) upload.push(local);
      continue;
    }

    if (isConflict(local, remote)) {
      conflicts.push({
        key: local.key,
        target: local.target,
        local,
        remote,
        reason: 'local and remote changed after last sync',
      });
      continue;
    }

    if (isNewer(remote.updatedAt, local.updatedAt)) {
      download.push(remote);
      continue;
    }

    if (hasPendingLocalChange(local) && isNewer(local.updatedAt, remote.updatedAt)) {
      upload.push(local);
    }
  }

  for (const remote of remoteItems) {
    if (!localByKey.has(remote.key)) {
      download.push(remote);
    }
  }

  return {
    upload: upload.sort(byKey),
    download: download.sort(byKey),
    conflicts: conflicts.sort(byKey),
    checkedAt: options.now ?? new Date().toISOString(),
    safeToAutoApply: conflicts.length === 0,
  };
}

export function resolveSyncConflict(conflict: SyncConflict, resolution: SyncConflictResolution): LocalSyncItem {
  if (resolution === 'keep-local') {
    return { ...conflict.local, syncState: 'dirty' };
  }
  return {
    key: conflict.remote.key,
    target: conflict.remote.target,
    updatedAt: conflict.remote.updatedAt,
    syncState: 'synced',
    payload: conflict.remote.payload,
  };
}

function localItem(
  target: SyncTarget,
  id: string,
  updatedAt: string,
  syncState: SyncState,
  payload: object,
): LocalSyncItem {
  return {
    key: `${target}:${id}`,
    target,
    updatedAt,
    syncState,
    payload: { ...payload } as Record<string, unknown>,
  };
}

function knowledgeMetadata(document: KnowledgeDocument): Record<string, unknown> {
  const { text: _text, pages: _pages, ...metadata } = document;
  return metadata;
}

function isConflict(local: LocalSyncItem, remote: RemoteSyncItem): boolean {
  return (local.syncState === 'dirty' || local.syncState === 'conflict') && local.updatedAt !== remote.updatedAt;
}

function hasPendingLocalChange(item: LocalSyncItem): boolean {
  return item.syncState !== 'synced' && item.syncState !== 'syncing';
}

function isNewer(left: string, right: string): boolean {
  return left.localeCompare(right) > 0;
}

function byKey<T extends { key: string }>(left: T, right: T): number {
  return left.key.localeCompare(right.key);
}
