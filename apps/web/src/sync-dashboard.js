const targetOrder = ['chats', 'settings', 'providers', 'prompts', 'agents', 'knowledge-metadata'];

const defaultT = (key, values = {}) => {
  const defaults = {
    'sync.enabled': 'Enabled',
    'sync.localOnly': 'Local only',
    'sync.noEndpoint': 'No sync endpoint configured',
    'sync.noScopes': 'No scopes selected',
    'sync.target.chats': 'chats',
    'sync.target.settings': 'settings',
    'sync.target.providers': 'providers',
    'sync.target.prompts': 'prompts',
    'sync.target.agents': 'agents',
    'sync.target.knowledgeMetadata': 'knowledge metadata',
    'sync.conflictNeedsReview': '{count} conflict{plural} need explicit review before sync.',
    'sync.noPendingAt': 'No pending sync changes as of {checkedAt}.',
    'sync.noPending': 'No pending sync changes.',
    'sync.readyCounts': '{upload} upload{uploadPlural} and {download} download{downloadPlural} ready.',
  };
  const template = defaults[key] ?? key;
  return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), template);
};

export function parseSyncTargets(value) {
  const requested = new Set(String(value ?? '').split(',').map((item) => item.trim().toLowerCase()));
  return targetOrder.filter((target) => requested.has(target));
}

export function createSyncDashboardViewModel(settings = {}, plan = emptyPlan(), { t = defaultT } = {}) {
  const counts = {
    upload: plan.upload?.length ?? 0,
    download: plan.download?.length ?? 0,
    conflicts: plan.conflicts?.length ?? 0,
  };
  const enabled = Boolean(settings.enabled);
  return {
    enabled,
    enabledLabel: enabled ? t('sync.enabled') : t('sync.localOnly'),
    endpointLabel: settings.endpoint || t('sync.noEndpoint'),
    targetLabel: describeTargets(settings, t),
    counts,
    canAutoApply: Boolean(plan.safeToAutoApply) && counts.conflicts === 0,
    statusLabel: describePlan(counts, plan.checkedAt, t),
  };
}

export function createLocalPreviewPlan(state, checkedAt = new Date().toISOString()) {
  const dirtySessions = (state.sessions ?? []).filter((session) => session.syncState !== 'synced');
  const promptTemplates = (state.promptTemplates ?? []).filter((template) => template.scope === 'sync');
  return {
    upload: [
      { key: 'settings:app' },
      ...(state.providers ?? []).map((provider) => ({ key: `provider:${provider.id}` })),
      ...dirtySessions.map((session) => ({ key: `session:${session.id}` })),
      ...promptTemplates.map((template) => ({ key: `prompt:${template.id}` })),
      ...(state.agentPresets ?? []).map((preset) => ({ key: `agent:${preset.id}` })),
    ],
    download: [],
    conflicts: [],
    checkedAt,
    safeToAutoApply: true,
  };
}

function emptyPlan() {
  return { upload: [], download: [], conflicts: [], safeToAutoApply: true };
}

function describePlan(counts, checkedAt, t = defaultT) {
  if (counts.conflicts > 0) {
    return t('sync.conflictNeedsReview', {
      count: counts.conflicts,
      plural: counts.conflicts === 1 ? '' : 's',
    });
  }
  if (counts.upload === 0 && counts.download === 0) {
    return checkedAt ? t('sync.noPendingAt', { checkedAt }) : t('sync.noPending');
  }
  return t('sync.readyCounts', {
    upload: counts.upload,
    uploadPlural: counts.upload === 1 ? '' : 's',
    download: counts.download,
    downloadPlural: counts.download === 1 ? '' : 's',
  });
}

function describeTargets(settings, t = defaultT) {
  const targets = [
    settings.includeChats !== false ? t('sync.target.chats') : undefined,
    settings.includeSettings !== false ? t('sync.target.settings') : undefined,
    settings.includeProviders !== false ? t('sync.target.providers') : undefined,
    settings.includePrompts !== false ? t('sync.target.prompts') : undefined,
    settings.includeAgents !== false ? t('sync.target.agents') : undefined,
    settings.includeKnowledgeMetadata !== false ? t('sync.target.knowledgeMetadata') : undefined,
  ].filter(Boolean);
  return targets.length > 0 ? targets.join(', ') : t('sync.noScopes');
}
