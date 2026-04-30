const targetOrder = ['chats', 'settings', 'providers', 'prompts', 'agents', 'knowledge-metadata'];

export function parseSyncTargets(value) {
  const requested = new Set(String(value ?? '').split(',').map((item) => item.trim().toLowerCase()));
  return targetOrder.filter((target) => requested.has(target));
}

export function createSyncDashboardViewModel(settings = {}, plan = emptyPlan()) {
  const counts = {
    upload: plan.upload?.length ?? 0,
    download: plan.download?.length ?? 0,
    conflicts: plan.conflicts?.length ?? 0,
  };
  const enabled = Boolean(settings.enabled);
  return {
    enabled,
    enabledLabel: enabled ? 'Enabled' : 'Local only',
    endpointLabel: settings.endpoint || 'No sync endpoint configured',
    targetLabel: describeTargets(settings),
    counts,
    canAutoApply: Boolean(plan.safeToAutoApply) && counts.conflicts === 0,
    statusLabel: describePlan(counts, plan.checkedAt),
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

function describePlan(counts, checkedAt) {
  if (counts.conflicts > 0) {
    return `${counts.conflicts} conflict${counts.conflicts === 1 ? '' : 's'} need explicit review before sync.`;
  }
  if (counts.upload === 0 && counts.download === 0) {
    return checkedAt ? `No pending sync changes as of ${checkedAt}.` : 'No pending sync changes.';
  }
  return `${counts.upload} upload${counts.upload === 1 ? '' : 's'} and ${counts.download} download${counts.download === 1 ? '' : 's'} ready.`;
}

function describeTargets(settings) {
  const targets = [
    settings.includeChats !== false ? 'chats' : undefined,
    settings.includeSettings !== false ? 'settings' : undefined,
    settings.includeProviders !== false ? 'providers' : undefined,
    settings.includePrompts !== false ? 'prompts' : undefined,
    settings.includeAgents !== false ? 'agents' : undefined,
    settings.includeKnowledgeMetadata !== false ? 'knowledge metadata' : undefined,
  ].filter(Boolean);
  return targets.length > 0 ? targets.join(', ') : 'No scopes selected';
}
