export function createInitialWebState(now = new Date().toISOString()) {
  const session = createSession('session-1', now);
  return {
    activeSessionId: session.id,
    activeAgentPresetId: undefined,
    sessions: [session],
    providers: [],
    agentPresets: [],
    attachments: [],
  };
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
      activeSessionId: parsed.activeSessionId ?? parsed.sessions[0].id,
      activeAgentPresetId: parsed.activeAgentPresetId,
      sessions: parsed.sessions,
      providers: Array.isArray(parsed.providers) ? parsed.providers : [],
      agentPresets: Array.isArray(parsed.agentPresets) ? parsed.agentPresets : [],
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

function normalizeAgentTools(value) {
  const values = Array.isArray(value) ? value : String(value ?? '').split(',');
  const known = new Set(['file-attachments', 'vision-input', 'voice-io', 'model-comparison', 'http-mcp']);
  const normalized = values.reduce((tools, tool) => {
    const trimmed = tool.trim();
    return known.has(trimmed) && !tools.includes(trimmed) ? [...tools, trimmed] : tools;
  }, []);
  return normalized.length > 0 ? normalized : ['file-attachments', 'vision-input'];
}

function normalizeKnowledgeScope(value) {
  return ['session', 'library'].includes(value) ? value : 'none';
}

function textMessagesForProvider(session) {
  return session.messages.map((message) => ({
    role: message.role,
    content: message.content.filter((item) => item.type === 'text').map((item) => item.text).join('\n'),
  }));
}
