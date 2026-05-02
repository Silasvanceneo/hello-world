export function createInitialWebState(now = new Date().toISOString()) {
  const session = createSession('session-1', now);
  return {
    updatedAt: now,
    locale: 'en',
    activeSessionId: session.id,
    activeAgentPresetId: undefined,
    activePromptTemplateId: undefined,
    routingStrategy: 'balanced',
    sessions: [session],
    providers: [],
    agentPresets: [],
    promptTemplates: [],
    usageBudget: { currency: 'USD' },
    syncSettings: normalizeSyncSettings(),
    attachments: [],
  };
}

export function markWebStateUpdated(state, timestamp = new Date().toISOString()) {
  return { ...state, updatedAt: nextStateTimestamp(state.updatedAt, timestamp) };
}

export function setLocale(state, locale, timestamp = new Date().toISOString()) {
  const normalized = normalizeLocale(locale);
  return state.locale === normalized
    ? state
    : { ...state, locale: normalized, updatedAt: nextStateTimestamp(state.updatedAt, timestamp) };
}

export function createSession(id = crypto.randomUUID(), timestamp = new Date().toISOString()) {
  return {
    id,
    title: 'Untitled chat',
    messages: [],
    tags: [],
    attachments: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    syncState: 'local',
  };
}

export function getActiveSession(state) {
  return state.sessions.find((session) => session.id === state.activeSessionId) ?? state.sessions[0];
}

export function getActiveAgentPreset(state) {
  return state.activeAgentPresetId
    ? state.agentPresets.find((preset) => preset.id === state.activeAgentPresetId)
    : undefined;
}

export function getActivePromptTemplate(state) {
  return state.activePromptTemplateId
    ? state.promptTemplates.find((template) => template.id === state.activePromptTemplateId)
    : undefined;
}

export function addSession(state, session) {
  return {
    ...state,
    activeSessionId: session.id,
    sessions: [session, ...state.sessions],
  };
}

export function addMessageToActiveSession(state, message) {
  const active = getActiveSession(state);
  return {
    ...state,
    sessions: state.sessions.map((session) => session.id === active.id
      ? { ...session, messages: [...session.messages, message], title: nextTitle(session, message), updatedAt: message.updatedAt, syncState: 'dirty' }
      : session),
  };
}

export function addAttachmentToActiveSession(state, attachment) {
  const active = getActiveSession(state);
  return {
    ...state,
    sessions: state.sessions.map((session) => session.id === active.id
      ? { ...session, attachments: [...(session.attachments ?? []), attachment], updatedAt: attachment.createdAt, syncState: 'dirty' }
      : session),
  };
}

export function updateActiveSessionOrganization(state, draft, timestamp = new Date().toISOString()) {
  const active = getActiveSession(state);
  const tags = normalizeList(String(draft.tags ?? '').split(','));
  return {
    ...state,
    sessions: state.sessions.map((session) => session.id === active.id
      ? {
        ...session,
        tags,
        pinned: Boolean(draft.pinned),
        archived: Boolean(draft.archived),
        updatedAt: timestamp,
        syncState: 'dirty',
      }
      : session),
  };
}

export function moveActiveSessionToTrash(state, timestamp = new Date().toISOString()) {
  const active = getActiveSession(state);
  const nextActive = state.sessions.find((session) => session.id !== active.id && !session.deletedAt);
  return {
    ...state,
    activeSessionId: nextActive?.id ?? active.id,
    sessions: state.sessions.map((session) => session.id === active.id
      ? {
        ...session,
        deletedAt: timestamp,
        updatedAt: timestamp,
        syncState: 'dirty',
      }
      : session),
  };
}

export function restoreSessionFromTrash(state, sessionId, timestamp = new Date().toISOString()) {
  return {
    ...state,
    activeSessionId: sessionId,
    sessions: state.sessions.map((session) => session.id === sessionId
      ? {
        ...session,
        deletedAt: undefined,
        updatedAt: timestamp,
        syncState: 'dirty',
      }
      : session),
  };
}

export function deleteSessionPermanently(state, sessionId) {
  const sessions = state.sessions.filter((session) => session.id !== sessionId);
  const fallback = sessions.find((session) => !session.deletedAt) ?? sessions[0];
  const nextSession = fallback ?? createSession(undefined, new Date().toISOString());
  return {
    ...state,
    activeSessionId: state.activeSessionId === sessionId ? nextSession.id : state.activeSessionId,
    sessions: sessions.length > 0 ? sessions : [nextSession],
  };
}

export function createMessageBranch(
  state,
  { fromMessageId, title, messages },
  timestamp = new Date().toISOString(),
  id = crypto.randomUUID(),
) {
  const active = getActiveSession(state);
  if (!active.messages.some((message) => message.id === fromMessageId)) {
    throw new Error(`Branch source message not found: ${fromMessageId}`);
  }
  const branch = {
    id,
    fromMessageId,
    title: title?.trim() || `Branch ${((active.branches ?? []).length + 1)}`,
    messages: messages ?? [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return {
    ...state,
    sessions: state.sessions.map((session) => session.id === active.id
      ? {
        ...session,
        branches: [...(session.branches ?? []), branch],
        updatedAt: timestamp,
        syncState: 'dirty',
      }
      : session),
  };
}

export function getSessionBranchView(session) {
  const branches = (session.branches ?? []).map((branch) => ({
    id: branch.id,
    fromMessageId: branch.fromMessageId,
    title: branch.title,
    messageCount: branch.messages.length,
    updatedAt: branch.updatedAt,
    active: branch.id === session.activeBranchId,
  }));
  return {
    activeBranchId: session.activeBranchId,
    branches,
    hasBranches: branches.length > 0,
  };
}

export function createSessionMessageView(session) {
  const branch = (session.branches ?? []).find((item) => item.id === session.activeBranchId);
  if (!branch) {
    return {
      title: session.title,
      messages: session.messages,
      activeBranch: undefined,
    };
  }
  return {
    title: `${session.title} / ${branch.title}`,
    messages: messagesWithBranch(session.messages, branch),
    activeBranch: branch,
  };
}

export function setActiveSessionBranch(state, branchId, timestamp = new Date().toISOString()) {
  const active = getActiveSession(state);
  if (!(active.branches ?? []).some((branch) => branch.id === branchId)) {
    throw new Error(`Branch not found: ${branchId}`);
  }
  return {
    ...state,
    sessions: state.sessions.map((session) => session.id === active.id
      ? {
        ...session,
        activeBranchId: branchId,
        updatedAt: timestamp,
        syncState: 'dirty',
      }
      : session),
  };
}

export function promoteActiveBranchToMain(state, timestamp = new Date().toISOString()) {
  const active = getActiveSession(state);
  const branch = (active.branches ?? []).find((item) => item.id === active.activeBranchId);
  if (!branch) {
    throw new Error('No active branch is available to save as main.');
  }
  return {
    ...state,
    sessions: state.sessions.map((session) => session.id === active.id
      ? {
        ...session,
        messages: messagesWithBranch(session.messages, branch),
        activeBranchId: undefined,
        updatedAt: timestamp,
        syncState: 'dirty',
      }
      : session),
  };
}

export function createBranchFromLastAssistant(state, timestamp = new Date().toISOString(), id = crypto.randomUUID()) {
  const active = getActiveSession(state);
  const source = [...active.messages].reverse().find((message) => message.role === 'assistant');
  if (!source) {
    throw new Error('No assistant message is available to branch.');
  }
  return createMessageBranch(state, {
    fromMessageId: source.id,
    title: `Alternative ${((active.branches ?? []).length + 1)}`,
    messages: [{
      ...source,
      id: `${id}:message`,
      createdAt: timestamp,
      updatedAt: timestamp,
    }],
  }, timestamp, id);
}

function messagesWithBranch(messages, branch) {
  const sourceIndex = messages.findIndex((message) => message.id === branch.fromMessageId);
  if (sourceIndex === -1) {
    return messages;
  }
  return [...messages.slice(0, sourceIndex), ...branch.messages];
}

export function upsertProvider(state, provider) {
  const exists = state.providers.some((item) => item.id === provider.id);
  return {
    ...state,
    providers: exists
      ? state.providers.map((item) => item.id === provider.id ? provider : item)
      : [provider, ...state.providers],
  };
}

export function createAgentPresetFromForm(
  { name, systemPrompt, defaultModelId, enabledTools, knowledgeBase, icon },
  timestamp = new Date().toISOString(),
  id = crypto.randomUUID(),
) {
  return {
    id,
    name: name.trim() || 'New agent',
    systemPrompt: systemPrompt.trim(),
    defaultModelId: defaultModelId?.trim() || undefined,
    enabledTools: normalizeAgentTools(enabledTools),
    knowledgeBase: { scope: normalizeKnowledgeScope(knowledgeBase), documentIds: [] },
    icon: icon?.trim() || '◯',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function upsertAgentPreset(state, preset) {
  const exists = state.agentPresets.some((item) => item.id === preset.id);
  return {
    ...state,
    activeAgentPresetId: preset.id,
    agentPresets: exists
      ? state.agentPresets.map((item) => item.id === preset.id ? preset : item)
      : [preset, ...state.agentPresets],
  };
}

export function setActiveAgentPreset(state, presetId) {
  return {
    ...state,
    activeAgentPresetId: state.agentPresets.some((preset) => preset.id === presetId) ? presetId : undefined,
  };
}

export function createProviderMessagesForActiveAgent(state, session) {
  const preset = getActiveAgentPreset(state);
  const messages = textMessagesForProvider(session);
  return preset?.systemPrompt
    ? [{ role: 'system', content: preset.systemPrompt }, ...messages]
    : messages;
}

export function createPromptTemplateFromForm(
  { title, body, variables, tags, favorite, scope },
  timestamp = new Date().toISOString(),
  id = crypto.randomUUID(),
) {
  const trimmedBody = body.trim();
  return {
    id,
    title: title.trim() || 'Untitled template',
    body: trimmedBody,
    variables: normalizeList(variables ? String(variables).split(',') : extractPromptVariables(trimmedBody)),
    tags: normalizeList(tags ? String(tags).split(',') : []),
    favorite: Boolean(favorite),
    scope: scope === 'sync' ? 'sync' : 'local',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function upsertPromptTemplate(state, template) {
  const exists = state.promptTemplates.some((item) => item.id === template.id);
  return {
    ...state,
    activePromptTemplateId: template.id,
    promptTemplates: exists
      ? state.promptTemplates.map((item) => item.id === template.id ? template : item)
      : [template, ...state.promptTemplates],
  };
}

export function setActivePromptTemplate(state, templateId) {
  return {
    ...state,
    activePromptTemplateId: state.promptTemplates.some((template) => template.id === templateId) ? templateId : undefined,
  };
}

export function renderPromptTemplateWithVariables(template, values) {
  const missingVariables = [];
  const text = template.body.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (match, name) => {
    const value = values[name]?.trim();
    if (!value) {
      if (!missingVariables.includes(name)) missingVariables.push(name);
      return match;
    }
    return value;
  });
  return { text, missingVariables };
}

export function setModelRoutingStrategy(state, strategy) {
  return {
    ...state,
    routingStrategy: normalizeRoutingStrategy(strategy),
  };
}

export function saveUsageBudget(state, budget) {
  return {
    ...state,
    usageBudget: {
      dailyLimit: parseOptionalPositiveNumber(budget.dailyLimit),
      monthlyLimit: parseOptionalPositiveNumber(budget.monthlyLimit),
      currency: budget.currency === 'CNY' ? 'CNY' : 'USD',
    },
  };
}

export function saveSyncSettings(state, draft) {
  const current = normalizeSyncSettings(state.syncSettings);
  const targets = draft.targets === undefined ? undefined : new Set(parseSyncTargetList(draft.targets));
  return {
    ...state,
    syncSettings: normalizeSyncSettings({
      enabled: draft.enabled ?? current.enabled,
      endpoint: draft.endpoint ?? current.endpoint,
      includeChats: targets ? targets.has('chats') : draft.includeChats ?? current.includeChats,
      includeSettings: targets ? targets.has('settings') : draft.includeSettings ?? current.includeSettings,
      includeProviders: targets ? targets.has('providers') : draft.includeProviders ?? current.includeProviders,
      includePrompts: targets ? targets.has('prompts') : draft.includePrompts ?? current.includePrompts,
      includeAgents: targets ? targets.has('agents') : draft.includeAgents ?? current.includeAgents,
      includeKnowledgeMetadata: targets
        ? targets.has('knowledge-metadata')
        : draft.includeKnowledgeMetadata ?? current.includeKnowledgeMetadata,
      lastSyncAt: current.lastSyncAt,
      lastError: current.lastError,
    }),
  };
}

export function summarizeUsage(session) {
  return session.messages.reduce((summary, message) => {
    const usage = message.usage;
    if (!usage) {
      return summary;
    }
    return {
      promptTokens: summary.promptTokens + usage.promptTokens,
      completionTokens: summary.completionTokens + usage.completionTokens,
      totalTokens: summary.totalTokens + usage.totalTokens,
    };
  }, { promptTokens: 0, completionTokens: 0, totalTokens: 0 });
}

export function createTextMessage(role, text, timestamp = new Date().toISOString(), id = crypto.randomUUID()) {
  return { id, role, content: [{ type: 'text', text }], createdAt: timestamp, updatedAt: timestamp };
}

export function createAssistantEchoMessage(text, timestamp = new Date().toISOString(), id = crypto.randomUUID()) {
  const output = `Echo: ${text}`;
  return {
    ...createTextMessage('assistant', output, timestamp, id),
    modelId: 'local-echo',
    usage: {
      promptTokens: countTokens(text),
      completionTokens: countTokens(output),
      totalTokens: countTokens(text) + countTokens(output),
    },
  };
}

export function prepareActiveSessionRetryDraft(state, timestamp = new Date().toISOString()) {
  const active = getActiveSession(state);
  const lastAssistantIndex = findLastMessageIndex(active.messages, (message) => message.role === 'assistant');
  if (lastAssistantIndex < 1) {
    throw new Error('No assistant reply is available to retry.');
  }
  const previousUserIndex = findLastMessageIndex(
    active.messages.slice(0, lastAssistantIndex),
    (message) => message.role === 'user',
  );
  if (previousUserIndex < 0) {
    throw new Error('No user prompt is available to retry.');
  }
  const draftText = textFromMessage(active.messages[previousUserIndex]);
  return {
    draftText,
    state: {
      ...state,
      sessions: state.sessions.map((session) => session.id === active.id
        ? {
          ...session,
          messages: session.messages.slice(0, previousUserIndex),
          updatedAt: timestamp,
          syncState: 'dirty',
        }
        : session),
    },
  };
}

export function prepareUserMessageEditDraft(state, messageId, timestamp = new Date().toISOString()) {
  const active = getActiveSession(state);
  const messageIndex = active.messages.findIndex((message) => message.id === messageId);
  const message = active.messages[messageIndex];
  if (!message || message.role !== 'user') {
    throw new Error(`User message not found: ${messageId}`);
  }
  return {
    draftText: textFromMessage(message),
    state: {
      ...state,
      sessions: state.sessions.map((session) => session.id === active.id
        ? {
          ...session,
          messages: session.messages.slice(0, messageIndex),
          updatedAt: timestamp,
          syncState: 'dirty',
        }
        : session),
    },
  };
}

export function createProviderFromForm({ name, type, baseUrl, modelId, apiKey }, timestamp = new Date().toISOString(), id = crypto.randomUUID()) {
  const trimmedName = name.trim() || defaultProviderName(type);
  return {
    id,
    type,
    name: trimmedName,
    baseUrl: baseUrl.trim() || undefined,
    defaultModelId: modelId?.trim() || undefined,
    apiKeyRef: apiKey ? `local:${id}` : undefined,
    enabled: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function serializeState(state) {
  return JSON.stringify(state);
}

export function parseState(raw, fallbackNow = new Date().toISOString()) {
  if (!raw) {
    return createInitialWebState(fallbackNow);
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.sessions) || parsed.sessions.length === 0) {
      return createInitialWebState(fallbackNow);
    }
    return {
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : latestStateTimestamp(parsed.sessions, fallbackNow),
      locale: normalizeLocale(parsed.locale),
      activeSessionId: parsed.activeSessionId ?? parsed.sessions[0].id,
      activeAgentPresetId: parsed.activeAgentPresetId,
      activePromptTemplateId: parsed.activePromptTemplateId,
      routingStrategy: normalizeRoutingStrategy(parsed.routingStrategy),
      sessions: parsed.sessions,
      providers: Array.isArray(parsed.providers) ? parsed.providers : [],
      agentPresets: Array.isArray(parsed.agentPresets) ? parsed.agentPresets : [],
      promptTemplates: Array.isArray(parsed.promptTemplates) ? parsed.promptTemplates : [],
      usageBudget: normalizeUsageBudget(parsed.usageBudget),
      syncSettings: normalizeSyncSettings(parsed.syncSettings),
      attachments: Array.isArray(parsed.attachments) ? parsed.attachments : [],
    };
  } catch {
    return createInitialWebState(fallbackNow);
  }
}

function nextTitle(session, message) {
  if (session.title !== 'Untitled chat' || message.role !== 'user') {
    return session.title;
  }
  const text = message.content.find((item) => item.type === 'text')?.text ?? 'Untitled chat';
  return text.slice(0, 40) || 'Untitled chat';
}

function defaultProviderName(type) {
  if (type === 'ollama') {
    return 'Local Ollama';
  }
  if (type === 'openai') {
    return 'OpenAI';
  }
  return 'OpenAI-compatible';
}

function countTokens(text) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function latestStateTimestamp(sessions, fallbackNow) {
  const timestamps = sessions.flatMap((session) => [session.createdAt, session.updatedAt, session.deletedAt]);
  return timestamps
    .filter((timestamp) => typeof timestamp === 'string' && !Number.isNaN(Date.parse(timestamp)))
    .sort()
    .at(-1) ?? fallbackNow;
}

function nextStateTimestamp(currentTimestamp, requestedTimestamp) {
  const current = Date.parse(currentTimestamp);
  const requested = Date.parse(requestedTimestamp);
  if (!Number.isFinite(current) || !Number.isFinite(requested) || requested > current) {
    return requestedTimestamp;
  }
  return new Date(current + 1).toISOString();
}

function normalizeAgentTools(value) {
  const values = Array.isArray(value) ? value : String(value ?? '').split(',');
  const known = new Set(['file-attachments', 'vision-input', 'voice-io', 'model-comparison', 'http-mcp']);
  const normalized = values.reduce((tools, tool) => {
    const trimmed = tool.trim();
    return known.has(trimmed) && !tools.includes(trimmed) ? [...tools, trimmed] : tools;
  }, []);
  return normalized.length > 0 ? normalized : ['file-attachments', 'vision-input'];
}

function normalizeList(values) {
  return values.reduce((items, value) => {
    const trimmed = value.trim();
    return trimmed && !items.includes(trimmed) ? [...items, trimmed] : items;
  }, []);
}

function extractPromptVariables(body) {
  return normalizeList(Array.from(body.matchAll(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g), (match) => match[1]));
}

function normalizeKnowledgeScope(value) {
  return ['session', 'library'].includes(value) ? value : 'none';
}

function normalizeRoutingStrategy(value) {
  return ['balanced', 'cheap', 'fast', 'long-context', 'privacy', 'fallback'].includes(value) ? value : 'balanced';
}

function normalizeLocale(value) {
  return ['en', 'zh'].includes(value) ? value : 'en';
}

function normalizeUsageBudget(value) {
  return {
    dailyLimit: parseOptionalPositiveNumber(value?.dailyLimit),
    monthlyLimit: parseOptionalPositiveNumber(value?.monthlyLimit),
    currency: value?.currency === 'CNY' ? 'CNY' : 'USD',
  };
}

function normalizeSyncSettings(value = {}) {
  return {
    enabled: Boolean(value.enabled),
    endpoint: sanitizeEndpoint(value.endpoint),
    includeChats: value.includeChats !== false,
    includeSettings: value.includeSettings !== false,
    includeProviders: value.includeProviders !== false,
    includePrompts: value.includePrompts !== false,
    includeAgents: value.includeAgents !== false,
    includeKnowledgeMetadata: value.includeKnowledgeMetadata !== false,
    lastSyncAt: typeof value.lastSyncAt === 'string' ? value.lastSyncAt : undefined,
    lastError: typeof value.lastError === 'string' ? value.lastError : undefined,
  };
}

function sanitizeEndpoint(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    url.username = '';
    url.password = '';
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/token|key|secret|password/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString().replace(/\?$/, '');
  } catch {
    return raw.replace(/\s+/g, '');
  }
}

function parseSyncTargetList(value) {
  const requested = new Set(String(value ?? '').split(',').map((item) => item.trim().toLowerCase()));
  return ['chats', 'settings', 'providers', 'prompts', 'agents', 'knowledge-metadata']
    .filter((target) => requested.has(target));
}

function parseOptionalPositiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function textMessagesForProvider(session) {
  return session.messages.map((message) => ({
    role: message.role,
    content: message.content.filter((item) => item.type === 'text').map((item) => item.text).join('\n'),
  }));
}

function findLastMessageIndex(messages, predicate) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (predicate(messages[index])) {
      return index;
    }
  }
  return -1;
}

function textFromMessage(message) {
  return message.content
    .filter((item) => item.type === 'text' || item.type === 'reasoning')
    .map((item) => item.text)
    .join('\n');
}
