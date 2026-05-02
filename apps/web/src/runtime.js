import {
  addAttachmentToActiveSession,
  addMessageToActiveSession,
  addSession,
  createAgentPresetFromForm,
  createAssistantEchoMessage,
  createInitialWebState,
  createPromptTemplateFromForm,
  createProviderMessagesForActiveAgent,
  createProviderFromForm,
  createSession,
  createTextMessage,
  createSessionMessageView,
  getActiveAgentPreset,
  getActivePromptTemplate,
  getActiveSession,
  markWebStateUpdated,
  parseState,
  prepareActiveSessionRetryDraft,
  prepareUserMessageEditDraft,
  renderPromptTemplateWithVariables,
  saveSyncSettings,
  saveUsageBudget,
  serializeState,
  setActiveAgentPreset,
  setActivePromptTemplate,
  setModelRoutingStrategy,
  summarizeUsage,
  upsertAgentPreset,
  upsertPromptTemplate,
  upsertProvider,
} from './web-state.js';
import {
  createWebBackupArchive,
  exportActiveSessionMarkdown,
  restoreWebBackupArchive,
  safeJson,
  summarizeBackupArchive,
} from './backup-dashboard.js';
import { bindBranchDashboard, renderBranchResults } from './branch-dashboard.js';
import { bindComposerDraftActions } from './composer-drafts.js';
import { createCostDashboardViewModel, createUsageRecordsFromWebState } from './cost-dashboard.js';
import { createLocalPreviewPlan, createSyncDashboardViewModel } from './sync-dashboard.js';
import { bindSessionOrganizer, createInitialSessionFilters, renderSessionOrganizer } from './session-organizer.js';
import { chooseProviderForRouting, describeRoutingChoice } from './model-routing.js';
import { compareProvidersInBrowser, formatComparisonResult } from './model-comparison.js';
import { bindMessageListWindow, renderMessageList } from './message-list.js';
import { bindMultiWindowSync, writeStateAcrossWindows } from './multi-window-sync.js';
import { bindDesktopCaptureRequests, detectLocalOllama } from './native-desktop.js';
import { configureServiceWorker } from './pwa-runtime.js';
import {
  captureMobilePhoto,
  captureScreenImage,
  createImageAttachmentFromDataUrl,
  readClipboardImage,
} from './native-media.js';
import { listenForSpeech, speakText } from './native-voice.js';
import { describeModelList, describeProviderValidationError } from './provider-diagnostics.js';
import { defaultModel, streamChatInBrowser, validateProviderInBrowser } from './provider-runtime.js';

const STORAGE_KEY = 'hello-world:web-state:v1';
const providerSecrets = new Map();
let activeAbortController;
let state = parseState(localStorage.getItem(STORAGE_KEY));
let comparisonPrompt = '';
let comparisonResults = [];
let sessionFilters = createInitialSessionFilters();
const expandedMessageSessions = new Set();

const elements = {
  agentIcon: document.querySelector('#agent-icon'),
  agentKnowledgeBase: document.querySelector('#agent-knowledge-base'),
  agentModel: document.querySelector('#agent-model'),
  agentName: document.querySelector('#agent-name'),
  agentPresetSelect: document.querySelector('#agent-preset-select'),
  agentStatus: document.querySelector('#agent-status'),
  agentSystemPrompt: document.querySelector('#agent-system-prompt'),
  agentTools: document.querySelector('#agent-tools'),
  applyPromptTemplate: document.querySelector('#apply-prompt-template'),
  attachments: document.querySelector('#attachments'),
  budgetCurrency: document.querySelector('#budget-currency'),
  budgetDaily: document.querySelector('#budget-daily'),
  budgetMonthly: document.querySelector('#budget-monthly'),
  backupExport: document.querySelector('#backup-export-json'),
  backupPayload: document.querySelector('#backup-payload'),
  backupRestore: document.querySelector('#backup-restore-json'),
  backupSessionMarkdown: document.querySelector('#backup-session-markdown'),
  backupStatus: document.querySelector('#backup-status'),
  branchLast: document.querySelector('#branch-last'),
  branchResults: document.querySelector('#branch-results'),
  compareModels: document.querySelector('#compare-models'),
  costStatus: document.querySelector('#cost-status'),
  costTrends: document.querySelector('#cost-trends'),
  comparisonResults: document.querySelector('#comparison-results'),
  composer: document.querySelector('#composer'),
  capturePhoto: document.querySelector('#capture-photo'),
  captureScreen: document.querySelector('#capture-screen'),
  fileInput: document.querySelector('#file-input'),
  messages: document.querySelector('#messages'),
  newSession: document.querySelector('#new-session'),
  pasteImage: document.querySelector('#paste-image'),
  prompt: document.querySelector('#prompt'),
  promptTemplateBody: document.querySelector('#prompt-template-body'),
  promptTemplateFavorite: document.querySelector('#prompt-template-favorite'),
  promptTemplateScope: document.querySelector('#prompt-template-scope'),
  promptTemplateSelect: document.querySelector('#prompt-template-select'),
  promptTemplateStatus: document.querySelector('#prompt-template-status'),
  promptTemplateTags: document.querySelector('#prompt-template-tags'),
  promptTemplateTitle: document.querySelector('#prompt-template-title'),
  promptTemplateValues: document.querySelector('#prompt-template-values'),
  promptTemplateVariables: document.querySelector('#prompt-template-variables'),
  providerBaseUrl: document.querySelector('#provider-base-url'),
  detectLocalOllama: document.querySelector('#detect-local-ollama'),
  providerModel: document.querySelector('#provider-model'),
  providerName: document.querySelector('#provider-name'),
  providerApiKey: document.querySelector('#provider-api-key'),
  providerStatus: document.querySelector('#provider-status'),
  providerType: document.querySelector('#provider-type'),
  routingStatus: document.querySelector('#routing-status'),
  routingStrategy: document.querySelector('#model-routing-strategy'),
  saveProvider: document.querySelector('#save-provider'),
  saveAgentPreset: document.querySelector('#save-agent-preset'),
  saveBudget: document.querySelector('#save-budget'),
  savePromptTemplate: document.querySelector('#save-prompt-template'),
  saveSessionOrganization: document.querySelector('#save-session-organization'),
  saveSyncSettings: document.querySelector('#save-sync-settings'),
  sessionArchived: document.querySelector('#session-archived'),
  sessionArchiveFilter: document.querySelector('#session-archive-filter'),
  sessionList: document.querySelector('#session-list'),
  sessionOrganizationStatus: document.querySelector('#session-organization-status'),
  sessionPinned: document.querySelector('#session-pinned'),
  sessionSearch: document.querySelector('#session-search'),
  sessionTagFilter: document.querySelector('#session-tag-filter'),
  sessionTags: document.querySelector('#session-tags'),
  sessionTitle: document.querySelector('#session-title'),
  stopGeneration: document.querySelector('#stop-generation'),
  syncCounts: document.querySelector('#sync-counts'),
  syncEnabled: document.querySelector('#sync-enabled'),
  syncEndpoint: document.querySelector('#sync-endpoint'),
  syncStatus: document.querySelector('#sync-status'),
  syncTargets: document.querySelector('#sync-targets'),
  previewSyncPlan: document.querySelector('#preview-sync-plan'),
  trashSession: document.querySelector('#trash-session'),
  restoreSession: document.querySelector('#restore-session'),
  deleteSessionForever: document.querySelector('#delete-session-forever'),
  speakLast: document.querySelector('#speak-last'),
  usageSummary: document.querySelector('#usage-summary'),
  voiceInput: document.querySelector('#voice-input'),
};

function saveState() {
  const result = writeStateAcrossWindows({
    storageKey: STORAGE_KEY,
    storage: localStorage,
    state,
    parseState,
    serializeState,
    markStateUpdated: markWebStateUpdated,
  });
  state = result.state;
}

function render() {
  const session = getActiveSession(state) ?? createInitialWebState().sessions[0];
  const messageView = createSessionMessageView(session);
  elements.sessionTitle.textContent = messageView.title;
  renderSessionOrganizer({ state, session, filters: sessionFilters, elements });
  elements.messages.innerHTML = renderMessageList({ ...session, messages: messageView.messages }, { expanded: expandedMessageSessions.has(session.id) });
  const usage = summarizeUsage(session);
  elements.usageSummary.textContent = `${usage.totalTokens} tokens`;
  elements.attachments.innerHTML = (session.attachments ?? []).map((attachment) => `<span class="attachment-chip">${escapeHtml(attachment.name)}</span>`).join('');
  elements.branchResults.innerHTML = renderBranchResults(session);
  elements.comparisonResults.innerHTML = renderComparisonResults();
  const provider = state.providers[0];
  elements.providerStatus.textContent = provider
    ? `Saved ${provider.name} (${provider.defaultModelId ?? defaultModel(provider.type)}). API keys stay in memory for this browser tab.`
    : 'No provider configured. Local echo mode is active.';
  renderAgentPresetPanel();
  renderPromptTemplatePanel();
  renderRoutingPanel();
  renderCostPanel();
  renderSyncPanel();
  renderBackupPanel();
}

function renderComparisonResults() {
  if (comparisonResults.length === 0) {
    return '';
  }
  return comparisonResults.map((result) => {
    const view = formatComparisonResult(result);
    const body = result.status === 'fulfilled' ? result.text : (result.errorMessage ?? 'Unknown error');
    const action = view.canSave
      ? `<button class="secondary-button" data-save-comparison-id="${escapeHtml(result.id)}" type="button">Save as main branch</button>`
      : '';
    return `<article class="comparison-card">
      <strong>${escapeHtml(view.title)}</strong>
      <p class="comparison-meta">${escapeHtml(view.statusLabel)} · ${escapeHtml(view.speedLabel)} · ${escapeHtml(view.tokenLabel)}</p>
      <pre>${escapeHtml(body || '(empty response)')}</pre>
      ${action}
    </article>`;
  }).join('');
}

elements.composer.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = elements.prompt.value.trim();
  if (!text || activeAbortController) {
    return;
  }
  const routeChoice = chooseProviderForRouting(state.providers, {
    strategy: state.routingStrategy ?? 'balanced',
    task: inferRoutingTask(getActiveSession(state)),
  });
  const provider = routeChoice?.provider;
  state = addMessageToActiveSession(state, createTextMessage('user', text));
  elements.prompt.value = '';
  saveState();
  render();

  if (!provider) {
    state = addMessageToActiveSession(state, createAssistantEchoMessage(text));
    saveState();
    render();
    return;
  }

  activeAbortController = new AbortController();
  elements.stopGeneration.disabled = false;
  let streamedText = '';
  try {
    streamedText = await streamChatInBrowser({
      provider,
      modelId: getActiveAgentPreset(state)?.defaultModelId ?? routeChoice.modelId ?? provider.defaultModelId ?? defaultModel(provider.type),
      apiKey: providerSecrets.get(provider.id),
      signal: activeAbortController.signal,
      messages: createProviderMessagesForActiveAgent(state, getActiveSession(state)),
      onDelta: (_delta, fullText) => {
        elements.providerStatus.textContent = `Streaming ${fullText.length} chars...`;
      },
    });
    state = addMessageToActiveSession(state, createTextMessage('assistant', streamedText || '(empty response)'));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown provider error.';
    state = addMessageToActiveSession(state, createTextMessage('assistant', `Provider error: ${message}`));
  } finally {
    activeAbortController = undefined;
    elements.stopGeneration.disabled = true;
    saveState();
    render();
  }
});

elements.stopGeneration.addEventListener('click', () => {
  activeAbortController?.abort();
});

elements.compareModels.addEventListener('click', async () => {
  const text = elements.prompt.value.trim();
  const providers = state.providers.filter((provider) => provider.enabled !== false);
  if (!text) {
    elements.providerStatus.textContent = 'Type a prompt before starting model comparison.';
    return;
  }
  if (providers.length === 0) {
    elements.providerStatus.textContent = 'Save at least one provider before model comparison.';
    return;
  }

  comparisonPrompt = text;
  elements.compareModels.disabled = true;
  elements.providerStatus.textContent = `Comparing ${providers.length} model${providers.length === 1 ? '' : 's'}...`;
  try {
    comparisonResults = await compareProvidersInBrowser({
      providers,
      prompt: text,
      providerSecrets,
      messages: createProviderMessagesForActiveAgent(state, getActiveSession(state)),
    });
    elements.providerStatus.textContent = `Comparison finished. Pick one answer to save as the main branch.`;
  } finally {
    elements.compareModels.disabled = false;
    render();
  }
});

bindBranchDashboard({
  elements,
  getState: () => state,
  setState: (nextState) => { state = nextState; },
  saveState,
  render,
});

bindMessageListWindow({
  elements,
  getSession: () => getActiveSession(state),
  expandSession: (sessionId) => expandedMessageSessions.add(sessionId),
  ...bindComposerDraftActions({
    elements,
    getState: () => state,
    setState: (nextState) => { state = nextState; },
    saveState,
    render,
    prepareEditDraft: prepareUserMessageEditDraft,
    prepareRetryDraft: prepareActiveSessionRetryDraft,
  }),
  render,
});

bindMultiWindowSync({
  storageKey: STORAGE_KEY,
  getState: () => state,
  setState: (nextState) => { state = nextState; },
  parseState,
  render,
  onStatus: (message) => { elements.providerStatus.textContent = message; },
});

elements.comparisonResults.addEventListener('click', (event) => {
  const button = event.target.closest('[data-save-comparison-id]');
  if (!button) {
    return;
  }
  const result = comparisonResults.find((item) => item.id === button.dataset.saveComparisonId);
  if (!result || result.status !== 'fulfilled') {
    return;
  }
  state = addMessageToActiveSession(state, createTextMessage('user', comparisonPrompt));
  state = addMessageToActiveSession(state, {
    ...createTextMessage('assistant', result.text || '(empty response)'),
    modelId: result.modelId,
    usage: result.usage,
  });
  comparisonPrompt = '';
  comparisonResults = [];
  elements.prompt.value = '';
  saveState();
  render();
});

elements.newSession.addEventListener('click', () => {
  state = addSession(state, createSession());
  saveState();
  render();
});

elements.sessionList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-session-id]');
  if (!button) {
    return;
  }
  state = { ...state, activeSessionId: button.dataset.sessionId };
  saveState();
  render();
});

elements.fileInput.addEventListener('change', () => {
  attachBrowserFiles(Array.from(elements.fileInput.files ?? []));
  elements.fileInput.value = '';
});

elements.captureScreen.addEventListener('click', () => {
  attachNativeImage('screenshot.png', () => captureScreenImage());
});

elements.pasteImage.addEventListener('click', () => {
  attachNativeImage('clipboard-image.png', () => readClipboardImage());
});

elements.capturePhoto.addEventListener('click', () => {
  attachNativeImage('camera-photo.jpg', () => captureMobilePhoto());
});

elements.voiceInput.addEventListener('click', async () => {
  elements.voiceInput.disabled = true;
  elements.providerStatus.textContent = 'Listening for voice input...';
  try {
    const transcript = await listenForSpeech();
    if (!transcript) {
      elements.providerStatus.textContent = 'No speech was captured.';
      return;
    }
    appendPromptText(transcript);
    elements.providerStatus.textContent = 'Voice input added to the prompt.';
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown voice input error.';
    elements.providerStatus.textContent = `Voice input unavailable: ${message}`;
  } finally {
    elements.voiceInput.disabled = false;
  }
});

elements.speakLast.addEventListener('click', async () => {
  const text = findLastAssistantText(getActiveSession(state));
  if (!text) {
    elements.providerStatus.textContent = 'No assistant message is available for speech playback.';
    return;
  }
  elements.speakLast.disabled = true;
  elements.providerStatus.textContent = 'Reading the latest assistant reply aloud...';
  try {
    await speakText(text);
    elements.providerStatus.textContent = 'Speech playback finished.';
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown speech playback error.';
    elements.providerStatus.textContent = `Speech playback unavailable: ${message}`;
  } finally {
    elements.speakLast.disabled = false;
  }
});

elements.messages.addEventListener('dragover', (event) => {
  event.preventDefault();
  elements.messages.classList.add('drop-active');
});

elements.messages.addEventListener('dragleave', () => {
  elements.messages.classList.remove('drop-active');
});

elements.messages.addEventListener('drop', (event) => {
  event.preventDefault();
  elements.messages.classList.remove('drop-active');
  attachBrowserFiles(Array.from(event.dataTransfer?.files ?? []));
});

elements.saveProvider.addEventListener('click', async () => {
  const provider = createProviderFromForm({
    name: elements.providerName.value,
    type: elements.providerType.value,
    baseUrl: elements.providerBaseUrl.value,
    modelId: elements.providerModel.value,
    apiKey: elements.providerApiKey.value,
  });
  if (elements.providerApiKey.value) {
    providerSecrets.set(provider.id, elements.providerApiKey.value);
  }
  state = upsertProvider(state, provider);
  elements.providerApiKey.value = '';
  saveState();
  render();
  try {
    const models = await validateProviderInBrowser(provider, { apiKey: providerSecrets.get(provider.id) });
    elements.providerStatus.textContent = describeModelList(models, provider.defaultModelId);
  } catch (error) {
    elements.providerStatus.textContent = `Saved, but ${describeProviderValidationError(error, provider)}`;
  }
});

elements.saveAgentPreset.addEventListener('click', () => {
  const current = getActiveAgentPreset(state);
  const normalized = createAgentPresetFromForm({
    name: elements.agentName.value,
    systemPrompt: elements.agentSystemPrompt.value,
    defaultModelId: elements.agentModel.value,
    enabledTools: elements.agentTools.value,
    knowledgeBase: elements.agentKnowledgeBase.value,
    icon: elements.agentIcon.value,
  }, new Date().toISOString(), current?.id);
  const preset = current ? { ...normalized, createdAt: current.createdAt } : normalized;
  state = upsertAgentPreset(state, preset);
  saveState();
  render();
  elements.agentStatus.textContent = `${preset.icon} ${preset.name} is active for new provider calls.`;
});

elements.agentPresetSelect.addEventListener('change', () => {
  state = setActiveAgentPreset(state, elements.agentPresetSelect.value);
  saveState();
  render();
});

bindSessionOrganizer({
  elements,
  getState: () => state,
  setState: (nextState) => { state = nextState; },
  getFilters: () => sessionFilters,
  setFilters: (nextFilters) => { sessionFilters = nextFilters; },
  saveState,
  render,
});

elements.savePromptTemplate.addEventListener('click', () => {
  const current = getActivePromptTemplate(state);
  const normalized = createPromptTemplateFromForm({
    title: elements.promptTemplateTitle.value,
    body: elements.promptTemplateBody.value,
    variables: elements.promptTemplateVariables.value,
    tags: elements.promptTemplateTags.value,
    favorite: elements.promptTemplateFavorite.checked,
    scope: elements.promptTemplateScope.value,
  }, new Date().toISOString(), current?.id);
  const template = current ? { ...normalized, createdAt: current.createdAt } : normalized;
  state = upsertPromptTemplate(state, template);
  saveState();
  render();
  elements.promptTemplateStatus.textContent = `${template.title} saved and ready to apply.`;
});

elements.promptTemplateSelect.addEventListener('change', () => {
  state = setActivePromptTemplate(state, elements.promptTemplateSelect.value);
  saveState();
  render();
});

elements.routingStrategy.addEventListener('change', () => {
  state = setModelRoutingStrategy(state, elements.routingStrategy.value);
  saveState();
  render();
});

elements.saveBudget.addEventListener('click', () => {
  state = saveUsageBudget(state, {
    dailyLimit: elements.budgetDaily.value,
    monthlyLimit: elements.budgetMonthly.value,
    currency: elements.budgetCurrency.value,
  });
  saveState();
  render();
});

elements.saveSyncSettings.addEventListener('click', () => {
  state = saveSyncSettings(state, {
    enabled: elements.syncEnabled.value === 'enabled',
    endpoint: elements.syncEndpoint.value,
    targets: elements.syncTargets.value,
  });
  saveState();
  render();
  elements.syncStatus.textContent = 'Sync settings saved locally. No network call was sent.';
});

elements.previewSyncPlan.addEventListener('click', () => {
  const plan = createLocalPreviewPlan(state);
  renderSyncPanel(plan);
  elements.syncStatus.textContent = `${createSyncDashboardViewModel(state.syncSettings, plan).statusLabel} Preview only; conflicts will require explicit choice.`;
});

elements.backupExport.addEventListener('click', () => {
  const archive = createWebBackupArchive(state);
  elements.backupPayload.value = safeJson(archive);
  elements.backupStatus.textContent = `JSON backup ready: ${summarizeBackupArchive(archive)} Copy it to a local file.`;
});

elements.backupSessionMarkdown.addEventListener('click', () => {
  elements.backupPayload.value = exportActiveSessionMarkdown(state);
  elements.backupStatus.textContent = 'Active session Markdown export is ready with sensitive text redacted.';
});

elements.backupRestore.addEventListener('click', () => {
  try {
    state = restoreWebBackupArchive(state, elements.backupPayload.value);
    saveState();
    render();
    elements.backupStatus.textContent = 'Backup restored locally. Provider API keys must be re-entered at runtime.';
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid backup JSON.';
    elements.backupStatus.textContent = `Restore failed: ${message}`;
  }
});

elements.applyPromptTemplate.addEventListener('click', () => {
  const template = getActivePromptTemplate(state);
  if (!template) {
    elements.promptTemplateStatus.textContent = 'Choose or save a template before applying.';
    return;
  }
  const values = parsePromptTemplateValues();
  if (!values) return;
  const rendered = renderPromptTemplateWithVariables(template, values);
  appendPromptText(rendered.text);
  elements.promptTemplateStatus.textContent = rendered.missingVariables.length > 0
    ? `Applied with unresolved variables: ${rendered.missingVariables.join(', ')}.`
    : `${template.title} applied to the composer.`;
});

elements.detectLocalOllama.addEventListener('click', async () => {
  try {
    const status = await detectLocalOllama();
    elements.providerType.value = 'ollama';
    elements.providerBaseUrl.value = status.url;
    elements.providerName.value ||= 'Local Ollama';
    elements.providerStatus.textContent = status.reachable
      ? `${status.message} Save the provider to use it.`
      : status.message;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown desktop detection error.';
    elements.providerStatus.textContent = message;
  }
});

bindDesktopCaptureRequests({
  onCaptureRequest: () => attachNativeImage('Desktop shortcut screenshot', captureScreenImage),
}).catch(() => undefined);

configureServiceWorker().catch(() => undefined);

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function attachBrowserFiles(files) {
  for (const file of files) {
    state = addAttachmentToActiveSession(state, {
      id: crypto.randomUUID(),
      kind: detectBrowserFileKind(file),
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      createdAt: new Date().toISOString(),
    });
  }
  saveState();
  render();
}

async function attachNativeImage(name, producer) {
  try {
    const dataUrl = await producer();
    state = addAttachmentToActiveSession(state, createImageAttachmentFromDataUrl(dataUrl, name));
    saveState();
    render();
    elements.providerStatus.textContent = `${name} attached. Choose a vision-capable model before asking about it.`;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown native input error.';
    elements.providerStatus.textContent = `Native image input unavailable: ${message}`;
  }
}

function appendPromptText(text) {
  const current = elements.prompt.value.trim();
  elements.prompt.value = current ? `${current}\n${text}` : text;
  elements.prompt.focus();
}

function findLastAssistantText(session) {
  return [...(session?.messages ?? [])]
    .reverse()
    .find((message) => message.role === 'assistant')
    ?.content
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('\n')
    .trim() ?? '';
}

function inferRoutingTask(session) {
  const attachments = session?.attachments ?? [];
  if (attachments.some((attachment) => attachment.kind === 'image')) return 'vision';
  if (attachments.length > 0) return 'files';
  return 'text';
}

function detectBrowserFileKind(file) {
  const name = file.name.toLowerCase();
  if (file.type.startsWith('image/')) return 'image';
  if (name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.docx')) return 'docx';
  if (name.endsWith('.xlsx')) return 'xlsx';
  if (name.endsWith('.md') || name.endsWith('.markdown')) return 'markdown';
  return 'text';
}

function renderAgentPresetPanel() {
  const active = getActiveAgentPreset(state);
  elements.agentPresetSelect.innerHTML = [
    '<option value="">No preset</option>',
    ...state.agentPresets.map((preset) => `<option value="${escapeHtml(preset.id)}">${escapeHtml(`${preset.icon} ${preset.name}`)}</option>`),
  ].join('');
  elements.agentPresetSelect.value = active?.id ?? '';
  if (active) {
    elements.agentName.value = active.name;
    elements.agentIcon.value = active.icon;
    elements.agentModel.value = active.defaultModelId ?? '';
    elements.agentSystemPrompt.value = active.systemPrompt;
    elements.agentTools.value = active.enabledTools.join(', ');
    elements.agentKnowledgeBase.value = active.knowledgeBase.scope;
    elements.agentStatus.textContent = `${active.icon} ${active.name} active. System prompt is prepended at runtime; tools remain governed by security defaults.`;
    return;
  }
  elements.agentStatus.textContent = 'No preset active. Provider calls use the normal chat context.';
}

function renderPromptTemplatePanel() {
  const active = getActivePromptTemplate(state);
  elements.promptTemplateSelect.innerHTML = [
    '<option value="">No template</option>',
    ...state.promptTemplates.map((template) => `<option value="${escapeHtml(template.id)}">${escapeHtml(template.favorite ? `★ ${template.title}` : template.title)}</option>`),
  ].join('');
  elements.promptTemplateSelect.value = active?.id ?? '';
  if (active) {
    elements.promptTemplateTitle.value = active.title;
    elements.promptTemplateBody.value = active.body;
    elements.promptTemplateVariables.value = active.variables.join(', ');
    elements.promptTemplateTags.value = active.tags.join(', ');
    elements.promptTemplateFavorite.checked = active.favorite;
    elements.promptTemplateScope.value = active.scope;
    elements.promptTemplateStatus.textContent = `${active.title} selected. Fill Variables JSON, then apply.`;
    return;
  }
  elements.promptTemplateStatus.textContent = 'No template selected. Save one to reuse prompts.';
}

function renderRoutingPanel() {
  const strategy = state.routingStrategy ?? 'balanced';
  elements.routingStrategy.value = strategy;
  const choice = chooseProviderForRouting(state.providers, {
    strategy,
    task: inferRoutingTask(getActiveSession(state)),
  });
  elements.routingStatus.textContent = describeRoutingChoice(choice);
}

function renderCostPanel() {
  const budget = state.usageBudget ?? { currency: 'USD' };
  elements.budgetDaily.value = budget.dailyLimit ?? '';
  elements.budgetMonthly.value = budget.monthlyLimit ?? '';
  elements.budgetCurrency.value = budget.currency ?? 'USD';
  const records = createUsageRecordsFromWebState(state);
  const view = createCostDashboardViewModel(records, { ...budget, now: new Date().toISOString() });
  elements.costStatus.textContent = `${view.totalCostLabel} estimated. ${view.budgetMessage}`;
  const latestDay = view.byDay.at(-1);
  const latestMonth = view.byMonth.at(-1);
  elements.costTrends.innerHTML = [
    `<li>Latest day <span>${escapeHtml(latestDay ? `${latestDay.key} / ${latestDay.totalTokens} tokens` : 'No usage')}</span></li>`,
    `<li>Latest month <span>${escapeHtml(latestMonth ? `${latestMonth.key} / ${latestMonth.totalTokens} tokens` : 'No usage')}</span></li>`,
  ].join('');
}

function renderSyncPanel(plan = createLocalPreviewPlan(state)) {
  const settings = state.syncSettings ?? {};
  const view = createSyncDashboardViewModel(settings, plan);
  elements.syncEnabled.value = settings.enabled ? 'enabled' : 'disabled';
  elements.syncEndpoint.value = settings.endpoint ?? '';
  elements.syncTargets.value = syncTargetCsv(settings);
  elements.syncStatus.textContent = `${view.enabledLabel}. ${view.statusLabel}`;
  elements.syncCounts.innerHTML = [
    `<li>Upload <span>${view.counts.upload}</span></li>`,
    `<li>Download <span>${view.counts.download}</span></li>`,
    `<li>Conflicts <span>${view.counts.conflicts}</span></li>`,
  ].join('');
}

function renderBackupPanel() {
  const archive = createWebBackupArchive(state);
  elements.backupStatus.textContent = `Ready to export: ${summarizeBackupArchive(archive)}`;
}

function parsePromptTemplateValues() {
  const raw = elements.promptTemplateValues.value.trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Variables JSON must be an object.');
    }
    return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value)]));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON.';
    elements.promptTemplateStatus.textContent = `Template variables error: ${message}`;
    return undefined;
  }
}

function syncTargetCsv(settings) {
  return [
    settings.includeChats !== false ? 'chats' : undefined,
    settings.includeSettings !== false ? 'settings' : undefined,
    settings.includeProviders !== false ? 'providers' : undefined,
    settings.includePrompts !== false ? 'prompts' : undefined,
    settings.includeAgents !== false ? 'agents' : undefined,
    settings.includeKnowledgeMetadata !== false ? 'knowledge-metadata' : undefined,
  ].filter(Boolean).join(', ');
}

render();
