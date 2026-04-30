export function createWebBackupArchive(state, exportedAt = new Date().toISOString()) {
  return {
    app: 'hello-world',
    version: 1,
    exportedAt,
    sessions: state.sessions ?? [],
    providers: (state.providers ?? []).map(stripProviderSecretRef),
    agentPresets: state.agentPresets ?? [],
    promptTemplates: state.promptTemplates ?? [],
    usageBudget: state.usageBudget,
    syncSettings: state.syncSettings,
  };
}

export function restoreWebBackupArchive(currentState, raw) {
  const archive = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!archive || archive.app !== 'hello-world' || archive.version !== 1) {
    throw new Error('Backup must be a hello-world v1 JSON archive.');
  }
  const sessions = Array.isArray(archive.sessions) && archive.sessions.length > 0
    ? archive.sessions
    : currentState.sessions;
  return {
    ...currentState,
    activeSessionId: sessions[0]?.id ?? currentState.activeSessionId,
    activeAgentPresetId: archive.agentPresets?.some((preset) => preset.id === currentState.activeAgentPresetId)
      ? currentState.activeAgentPresetId
      : undefined,
    activePromptTemplateId: archive.promptTemplates?.some((template) => template.id === currentState.activePromptTemplateId)
      ? currentState.activePromptTemplateId
      : undefined,
    sessions,
    providers: Array.isArray(archive.providers) ? archive.providers.map(stripProviderSecretRef) : [],
    agentPresets: Array.isArray(archive.agentPresets) ? archive.agentPresets : [],
    promptTemplates: Array.isArray(archive.promptTemplates) ? archive.promptTemplates : [],
    usageBudget: archive.usageBudget ?? currentState.usageBudget,
    syncSettings: archive.syncSettings ?? currentState.syncSettings,
  };
}

export function exportActiveSessionMarkdown(state) {
  const session = state.sessions.find((item) => item.id === state.activeSessionId) ?? state.sessions[0];
  if (!session) return '';
  return exportSessionMarkdown(session);
}

export function exportSessionMarkdown(session) {
  const lines = [
    `# ${redactSensitiveText(session.title)}`,
    '',
    `- Session ID: ${session.id}`,
    `- Updated: ${session.updatedAt}`,
    '',
    ...session.messages.flatMap((message) => [
      `## ${titleCase(message.role)}`,
      '',
      message.content.map(contentToText).filter(Boolean).map(redactSensitiveText).join('\n\n'),
      '',
    ]),
  ];
  return `${lines.join('\n').trim()}\n`;
}

export function summarizeBackupArchive(archive) {
  const sessions = archive.sessions?.length ?? 0;
  const prompts = archive.promptTemplates?.length ?? 0;
  const agents = archive.agentPresets?.length ?? 0;
  const providers = archive.providers?.length ?? 0;
  return `${sessions} session${sessions === 1 ? '' : 's'}, ${prompts} prompt${prompts === 1 ? '' : 's'}, ${agents} agent${agents === 1 ? '' : 's'}, ${providers} provider${providers === 1 ? '' : 's'}.`;
}

export function safeJson(value) {
  return JSON.stringify(value, null, 2);
}

function stripProviderSecretRef(provider) {
  const { apiKeyRef: _apiKeyRef, ...safeProvider } = provider;
  return safeProvider;
}

function contentToText(content) {
  if (content.type === 'text' || content.type === 'reasoning') return content.text;
  if (content.type === 'image') return `[image: ${content.fileId}, ${content.mimeType}]`;
  if (content.type === 'file') return `[file: ${content.name}, ${content.mimeType}]`;
  if (content.type === 'citation') return `[citation: ${content.label}]`;
  if (content.type === 'tool-call') return `[tool-call: ${content.name}]`;
  if (content.type === 'tool-result') return `[tool-result: ${content.toolCallId}]`;
  return '';
}

function redactSensitiveText(value) {
  return String(value)
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-????')
    .replace(/(api[_-]?key\s*[:=]\s*)([^\s,;]+)/gi, '$1????')
    .replace(/(authorization\s*[:=]\s*bearer\s+)([^\s,;]+)/gi, '$1????');
}

function titleCase(value) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
