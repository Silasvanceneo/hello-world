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
  saveAdvancedSettings,
  saveUsageBudget,
  serializeState,
  setActiveAgentPreset,
  setLocale,
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
import {
  createAdvancedSettingsViewModel,
  detectAdvancedPlatform,
  renderAdvancedSettingsSummary,
} from './advanced-settings.js';
import { bindBranchDashboard, renderBranchResults } from './branch-dashboard.js';
import { bindComposerDraftActions } from './composer-drafts.js';
import { createCostDashboardViewModel, createUsageRecordsFromWebState } from './cost-dashboard.js';
import { createLocalPreviewPlan, createSyncDashboardViewModel } from './sync-dashboard.js';
import { bindSessionOrganizer, createInitialSessionFilters, renderSessionOrganizer } from './session-organizer.js';
import { chooseProviderForRouting, describeRoutingChoice } from './model-routing.js';
import { compareProvidersInBrowser, formatComparisonResult } from './model-comparison.js';
import { bindMessageListWindow, renderMessageList } from './message-list.js';
import { applyTranslations, createTranslator } from './localization.js';
import { bindMultiWindowSync, writeStateAcrossWindows } from './multi-window-sync.js';
import {
  bindDesktopCaptureRequests,
  createDesktopProviderFetch,
  detectLocalOllama,
  readDesktopNativeCapabilities,
  summarizeDesktopNativeCapabilities,
} from './native-desktop.js';
import { configureServiceWorker } from './pwa-runtime.js';
import { bindSettingsView } from './settings-view.js';
import {
  captureMobilePhoto,
  captureScreenImage,
  createImageAttachmentFromDataUrl,
  readClipboardImage,
} from './native-media.js';
import { listenForSpeech, speakText } from './native-voice.js';
import { describeModelList, describeProviderValidationError } from './provider-diagnostics.js';
import { applyProviderPresetToFields, renderProviderPresetOptions } from './provider-presets.js';
import { defaultModel, streamChatInBrowser, validateProviderInBrowser } from './provider-runtime.js';

const STORAGE_KEY = 'hello-world:web-state:v1';
const providerSecrets = new Map();
let activeAbortController;
let state = parseState(localStorage.getItem(STORAGE_KEY));
let comparisonPrompt = '';
let comparisonResults = [];
let sessionFilters = createInitialSessionFilters();
const expandedMessageSessions = new Set();
let desktopCapabilitySummary;
const desktopProviderFetch = createDesktopProviderFetch();

const elements = {
  agentIcon: document.querySelector('#agent-icon'),
  agentKnowledgeBase: document.querySelector('#agent-knowledge-base'),
  agentModel: document.querySelector('#agent-model'),
  agentName: document.querySelector('#agent-name'),
  agentPresetSelect: document.querySelector('#agent-preset-select'),
  agentStatus: document.querySelector('#agent-status'),
  agentSystemPrompt: document.querySelector('#agent-system-prompt'),
  agentTools: document.querySelector('#agent-tools'),
  advancedCapabilityList: document.querySelector('#advanced-capability-list'),
  advancedPlatformStatus: document.querySelector('#advanced-platform-status'),
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
  languageSelect: document.querySelector('#language-select'),
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
  providerModelOptions: document.querySelector('#provider-model-options'),
  providerName: document.querySelector('#provider-name'),
  providerApiKey: document.querySelector('#provider-api-key'),
  providerPreset: document.querySelector('#provider-preset'),
  providerStatus: document.querySelector('#provider-status'),
  providerType: document.querySelector('#provider-type'),
  routingStatus: document.querySelector('#routing-status'),
  routingStrategy: document.querySelector('#model-routing-strategy'),
  settingsTriggers: document.querySelectorAll('[data-open-settings]'),
  chatTriggers: document.querySelectorAll('[data-open-chat]'),
  saveProvider: document.querySelector('#save-provider'),
  refreshProviderModels: document.querySelector('#refresh-provider-models'),
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
  codeExecutionConfirmation: document.querySelector('#code-execution-confirmation'),
  codeExecutionEnabled: document.querySelector('#code-execution-enabled'),
  codeExecutionLanguage: document.querySelector('#code-execution-language'),
  codeExecutionStatus: document.querySelector('#code-execution-status'),
  codeExecutionTimeout: document.querySelector('#code-execution-timeout'),
  httpMcpEnabled: document.querySelector('#http-mcp-enabled'),
  httpMcpEndpoint: document.querySelector('#http-mcp-endpoint'),
  httpMcpName: document.querySelector('#http-mcp-name'),
  httpMcpTools: document.querySelector('#http-mcp-tools'),
  mcpRequireConfirmation: document.querySelector('#mcp-require-confirmation'),
  mcpStatus: document.querySelector('#mcp-status'),
  pluginManagerEnabled: document.querySelector('#plugin-manager-enabled'),
  ragEmbeddingProvider: document.querySelector('#rag-embedding-provider'),
  ragEnabled: document.querySelector('#rag-enabled'),
  ragIndexMode: document.querySelector('#rag-index-mode'),
  ragMaxChunks: document.querySelector('#rag-max-chunks'),
  ragRequireCitations: document.querySelector('#rag-require-citations'),
  ragReranking: document.querySelector('#rag-reranking'),
  ragRetrievalMode: document.querySelector('#rag-retrieval-mode'),
  ragSourceScope: document.querySelector('#rag-source-scope'),
  ragStatus: document.querySelector('#rag-status'),
  speakLast: document.querySelector('#speak-last'),
  saveCodeExecutionSettings: document.querySelector('#save-code-execution-settings'),
  saveMcpSettings: document.querySelector('#save-mcp-settings'),
  saveRagSettings: document.querySelector('#save-rag-settings'),
  saveWebSearchSettings: document.querySelector('#save-web-search-settings'),
  stdioMcpEnabled: document.querySelector('#stdio-mcp-enabled'),
  usageSummary: document.querySelector('#usage-summary'),
  voiceInput: document.querySelector('#voice-input'),
  webSearchDesktopProxy: document.querySelector('#web-search-desktop-proxy'),
  webSearchEnabled: document.querySelector('#web-search-enabled'),
  webSearchEndpoint: document.querySelector('#web-search-endpoint'),
  webSearchGrounded: document.querySelector('#web-search-grounded'),
  webSearchMaxResults: document.querySelector('#web-search-max-results'),
  webSearchProviderName: document.querySelector('#web-search-provider-name'),
  webSearchProviderType: document.querySelector('#web-search-provider-type'),
  webSearchStatus: document.querySelector('#web-search-status'),
};

let t = createTranslator(state.locale);

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
  t = applyTranslations(document, state.locale);
  elements.languageSelect.value = state.locale ?? 'en';
  const session = getActiveSession(state) ?? createInitialWebState().sessions[0];
  const messageView = createSessionMessageView(session);
  elements.sessionTitle.textContent = messageView.title;
  renderSessionOrganizer({ state, session, filters: sessionFilters, elements, t });
  elements.messages.innerHTML = renderMessageList(
    { ...session, messages: messageView.messages },
    { expanded: expandedMessageSessions.has(session.id), t },
  );
  const usage = summarizeUsage(session);
  elements.usageSummary.textContent = t('usage.tokens', { count: usage.totalTokens });
  elements.attachments.innerHTML = (session.attachments ?? []).map((attachment) => `<span class="attachment-chip">${escapeHtml(attachment.name)}</span>`).join('');
  elements.branchResults.innerHTML = renderBranchResults(session, { t });
  elements.comparisonResults.innerHTML = renderComparisonResults();
  const provider = state.providers[0];
  elements.providerPreset.innerHTML = renderProviderPresetOptions({ t });
  elements.providerPreset.value = '';
  elements.providerStatus.textContent = provider
    ? t('provider.saved', { name: provider.name, model: provider.defaultModelId ?? defaultModel(provider.type) })
    : t('provider.localEcho');
  renderAgentPresetPanel();
  renderPromptTemplatePanel();
  renderRoutingPanel();
  renderCostPanel();
  renderSyncPanel();
  renderBackupPanel();
  renderAdvancedSettingsPanel();
}

function renderComparisonResults() {
  if (comparisonResults.length === 0) {
    return '';
  }
  return comparisonResults.map((result) => {
    const view = formatComparisonResult(result, { t });
    const body = result.status === 'fulfilled' ? result.text : (result.errorMessage ?? t('comparison.unknownError'));
    const action = view.canSave
      ? `<button class="secondary-button" data-save-comparison-id="${escapeHtml(result.id)}" type="button">${escapeHtml(t('comparison.saveMain'))}</button>`
      : '';
    return `<article class="comparison-card">
      <strong>${escapeHtml(view.title)}</strong>
      <p class="comparison-meta">${escapeHtml(view.statusLabel)} / ${escapeHtml(view.speedLabel)} / ${escapeHtml(view.tokenLabel)}</p>
      <pre>${escapeHtml(body || t('status.emptyResponse'))}</pre>
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
      fetch: desktopProviderFetch,
      messages: createProviderMessagesForActiveAgent(state, getActiveSession(state)),
      onDelta: (_delta, fullText) => {
        elements.providerStatus.textContent = t('status.streaming', { count: fullText.length });
      },
    });
    state = addMessageToActiveSession(state, createTextMessage('assistant', streamedText || t('status.emptyResponse')));
  } catch (error) {
    const message = error instanceof Error ? error.message : t('status.unknownProviderError');
    state = addMessageToActiveSession(state, createTextMessage('assistant', t('status.providerError', { message })));
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

elements.languageSelect.addEventListener('change', () => {
  state = setLocale(state, elements.languageSelect.value);
  saveState();
  render();
  elements.providerStatus.textContent = t('language.saved');
});

elements.compareModels.addEventListener('click', async () => {
  const text = elements.prompt.value.trim();
  const providers = state.providers.filter((provider) => provider.enabled !== false);
  if (!text) {
    elements.providerStatus.textContent = t('status.typePromptCompare');
    return;
  }
  if (providers.length === 0) {
    elements.providerStatus.textContent = t('status.saveProviderCompare');
    return;
  }

  comparisonPrompt = text;
  elements.compareModels.disabled = true;
  elements.providerStatus.textContent = t('status.comparing', {
    count: providers.length,
    plural: providers.length === 1 ? '' : 's',
  });
  try {
    comparisonResults = await compareProvidersInBrowser({
      providers,
      prompt: text,
      providerSecrets,
      messages: createProviderMessagesForActiveAgent(state, getActiveSession(state)),
      fetch: desktopProviderFetch,
    });
    elements.providerStatus.textContent = t('status.comparisonFinished');
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
  getTranslator: () => t,
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
  promptTarget: elements.prompt,
  render,
});

bindMultiWindowSync({
  storageKey: STORAGE_KEY,
  getState: () => state,
  setState: (nextState) => { state = nextState; },
  parseState,
  render,
  onStatus: (message) => {
    elements.providerStatus.textContent = message === 'Updated from another window.'
      ? t('status.updatedOtherWindow')
      : message;
  },
});

bindSettingsView({
  root: document.body,
  settingsTriggers: elements.settingsTriggers,
  chatTriggers: elements.chatTriggers,
  focusTarget: elements.prompt,
  scrollContainer: elements.messages,
  scrollTarget: elements.composer,
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
    ...createTextMessage('assistant', result.text || t('status.emptyResponse')),
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
  elements.providerStatus.textContent = t('status.voiceListening');
  try {
    const transcript = await listenForSpeech();
    if (!transcript) {
      elements.providerStatus.textContent = t('status.noSpeech');
      return;
    }
    appendPromptText(transcript);
    elements.providerStatus.textContent = t('status.voiceAdded');
  } catch (error) {
    const message = error instanceof Error ? error.message : t('status.voiceUnknown');
    elements.providerStatus.textContent = t('status.voiceUnavailable', { message });
  } finally {
    elements.voiceInput.disabled = false;
  }
});

elements.speakLast.addEventListener('click', async () => {
  const text = findLastAssistantText(getActiveSession(state));
  if (!text) {
    elements.providerStatus.textContent = t('status.noSpeechPlayback');
    return;
  }
  elements.speakLast.disabled = true;
  elements.providerStatus.textContent = t('status.speechReading');
  try {
    await speakText(text);
    elements.providerStatus.textContent = t('status.speechFinished');
  } catch (error) {
    const message = error instanceof Error ? error.message : t('status.speechUnknown');
    elements.providerStatus.textContent = t('status.speechUnavailable', { message });
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
  const provider = createProviderDraftFromInputs();
  rememberProviderSecret(provider);
  state = upsertProvider(state, provider);
  elements.providerApiKey.value = '';
  saveState();
  render();
  try {
    const models = await refreshProviderModels(provider);
    elements.providerStatus.textContent = describeModelList(models, provider.defaultModelId, { t });
  } catch (error) {
    elements.providerStatus.textContent = t('status.savedBut', { message: describeProviderValidationError(error, provider, { t }) });
  }
});

elements.refreshProviderModels.addEventListener('click', async () => {
  const provider = createProviderDraftFromInputs(state.providers[0]?.id);
  rememberProviderSecret(provider);
  elements.refreshProviderModels.disabled = true;
  elements.providerStatus.textContent = t('provider.modelsRefreshing');
  try {
    const models = await refreshProviderModels(provider);
    if (!elements.providerModel.value && models[0]) {
      elements.providerModel.value = models[0];
    }
    elements.providerStatus.textContent = t('provider.modelsLoaded', {
      count: models.length,
      plural: models.length === 1 ? '' : 's',
    });
  } catch (error) {
    elements.providerStatus.textContent = describeProviderValidationError(error, provider, { t });
  } finally {
    elements.refreshProviderModels.disabled = false;
  }
});

elements.providerPreset.addEventListener('change', () => {
  const result = applyProviderPresetToFields(elements.providerPreset.value, elements, { t });
  if (result.status) {
    elements.providerStatus.textContent = result.status;
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
  elements.agentStatus.textContent = t('agent.savedActive', { icon: preset.icon, name: preset.name });
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
  elements.promptTemplateStatus.textContent = t('prompt.saved', { title: template.title });
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
  elements.syncStatus.textContent = t('sync.settingsSaved');
});

elements.previewSyncPlan.addEventListener('click', () => {
  const plan = createLocalPreviewPlan(state);
  renderSyncPanel(plan);
  elements.syncStatus.textContent = t('sync.previewOnly', {
    status: createSyncDashboardViewModel(state.syncSettings, plan, { t }).statusLabel,
  });
});

elements.saveRagSettings.addEventListener('click', () => {
  state = saveAdvancedSettings(state, {
    rag: {
      enabled: elements.ragEnabled.checked,
      sourceScope: elements.ragSourceScope.value,
      embeddingProvider: elements.ragEmbeddingProvider.value,
      indexMode: elements.ragIndexMode.value,
      retrievalMode: elements.ragRetrievalMode.value,
      maxChunks: elements.ragMaxChunks.value,
      requireCitations: elements.ragRequireCitations.checked,
      rerankingEnabled: elements.ragReranking.checked,
    },
  });
  saveState();
  render();
  elements.ragStatus.textContent = t('advanced.savedRag');
});

elements.saveWebSearchSettings.addEventListener('click', () => {
  const desktop = detectAdvancedPlatform() === 'desktop';
  state = saveAdvancedSettings(state, {
    webSearch: {
      enabled: elements.webSearchEnabled.checked,
      providerType: elements.webSearchProviderType.value,
      providerName: elements.webSearchProviderName.value,
      endpoint: elements.webSearchEndpoint.value,
      maxResults: elements.webSearchMaxResults.value,
      groundedAnswers: elements.webSearchGrounded.checked,
      desktopProxy: desktop && elements.webSearchDesktopProxy.checked,
    },
  });
  saveState();
  render();
  elements.webSearchStatus.textContent = t('advanced.savedWebSearch');
});

elements.saveMcpSettings.addEventListener('click', () => {
  const desktop = detectAdvancedPlatform() === 'desktop';
  state = saveAdvancedSettings(state, {
    mcp: {
      httpEnabled: elements.httpMcpEnabled.checked,
      httpServerName: elements.httpMcpName.value,
      httpEndpoint: elements.httpMcpEndpoint.value,
      httpTools: elements.httpMcpTools.value,
      pluginManagerEnabled: desktop && elements.pluginManagerEnabled.checked,
      stdioMcpEnabled: desktop && elements.stdioMcpEnabled.checked,
    },
  });
  saveState();
  render();
  elements.mcpStatus.textContent = desktop ? t('advanced.savedMcpDesktop') : t('advanced.savedMcpSafe');
});

elements.saveCodeExecutionSettings.addEventListener('click', () => {
  const desktop = detectAdvancedPlatform() === 'desktop';
  state = saveAdvancedSettings(state, {
    codeExecution: {
      enabled: desktop && elements.codeExecutionEnabled.checked,
      language: elements.codeExecutionLanguage.value,
      timeoutMs: elements.codeExecutionTimeout.value,
    },
  });
  saveState();
  render();
  elements.codeExecutionStatus.textContent = desktop ? t('advanced.savedCodeDesktop') : t('advanced.savedCodeUnavailable');
});

elements.backupExport.addEventListener('click', () => {
  const archive = createWebBackupArchive(state);
  elements.backupPayload.value = safeJson(archive);
  elements.backupStatus.textContent = t('backup.jsonReady', { summary: summarizeBackupArchive(archive, { t }) });
});

elements.backupSessionMarkdown.addEventListener('click', () => {
  elements.backupPayload.value = exportActiveSessionMarkdown(state);
  elements.backupStatus.textContent = t('backup.markdownReady');
});

elements.backupRestore.addEventListener('click', () => {
  try {
    state = restoreWebBackupArchive(state, elements.backupPayload.value);
    saveState();
    render();
    elements.backupStatus.textContent = t('backup.restored');
  } catch (error) {
    const message = error instanceof Error ? error.message : t('backup.invalidJson');
    elements.backupStatus.textContent = t('backup.restoreFailed', { message });
  }
});

elements.applyPromptTemplate.addEventListener('click', () => {
  const template = getActivePromptTemplate(state);
  if (!template) {
    elements.promptTemplateStatus.textContent = t('prompt.chooseBeforeApply');
    return;
  }
  const values = parsePromptTemplateValues();
  if (!values) return;
  const rendered = renderPromptTemplateWithVariables(template, values);
  appendPromptText(rendered.text);
  elements.promptTemplateStatus.textContent = rendered.missingVariables.length > 0
    ? t('prompt.appliedMissing', { variables: rendered.missingVariables.join(', ') })
    : t('prompt.applied', { title: template.title });
});

elements.detectLocalOllama.addEventListener('click', async () => {
  try {
    const status = await detectLocalOllama();
    elements.providerType.value = 'ollama';
    elements.providerBaseUrl.value = status.url;
    elements.providerName.value ||= 'Local Ollama';
    elements.providerStatus.textContent = status.reachable
      ? t('status.localOllamaReady', { message: status.message })
      : status.message;
  } catch (error) {
    const message = error instanceof Error ? error.message : t('status.desktopDetectionUnknown');
    elements.providerStatus.textContent = message;
  }
});

bindDesktopCaptureRequests({
  onCaptureRequest: () => attachNativeImage(t('status.desktopShortcutScreenshotName'), captureScreenImage),
}).catch(() => undefined);

readDesktopNativeCapabilities()
  .then((capabilities) => {
    desktopCapabilitySummary = summarizeDesktopNativeCapabilities(capabilities);
    renderAdvancedSettingsPanel();
  })
  .catch(() => undefined);

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
    elements.providerStatus.textContent = t('status.imageAttached', { name });
  } catch (error) {
    const message = error instanceof Error ? error.message : t('status.nativeInputUnknown');
    elements.providerStatus.textContent = t('status.nativeInputUnavailable', { message });
  }
}

function createProviderDraftFromInputs(id) {
  return createProviderFromForm({
    name: elements.providerName.value,
    type: elements.providerType.value,
    baseUrl: elements.providerBaseUrl.value,
    modelId: elements.providerModel.value,
    apiKey: elements.providerApiKey.value,
  }, new Date().toISOString(), id);
}

function rememberProviderSecret(provider) {
  if (elements.providerApiKey.value) {
    providerSecrets.set(provider.id, elements.providerApiKey.value);
  }
}

async function refreshProviderModels(provider) {
  const models = await validateProviderInBrowser(provider, {
    apiKey: providerSecrets.get(provider.id),
    fetch: desktopProviderFetch,
  });
  renderProviderModelOptions(models);
  return models;
}

function renderProviderModelOptions(models) {
  elements.providerModelOptions.innerHTML = models
    .slice(0, 200)
    .map((model) => `<option value="${escapeHtml(model)}"></option>`)
    .join('');
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
    `<option value="">${escapeHtml(t('agent.noPreset'))}</option>`,
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
    elements.agentStatus.textContent = t('agent.activeDetail', { icon: active.icon, name: active.name });
    return;
  }
  elements.agentStatus.textContent = t('agent.noneActiveDetail');
}

function renderPromptTemplatePanel() {
  const active = getActivePromptTemplate(state);
  elements.promptTemplateSelect.innerHTML = [
    `<option value="">${escapeHtml(t('prompt.noTemplate'))}</option>`,
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
    elements.promptTemplateStatus.textContent = t('prompt.selected', { title: active.title });
    return;
  }
  elements.promptTemplateStatus.textContent = t('prompt.noneSelectedDetail');
}

function renderRoutingPanel() {
  const strategy = state.routingStrategy ?? 'balanced';
  elements.routingStrategy.value = strategy;
  const choice = chooseProviderForRouting(state.providers, {
    strategy,
    task: inferRoutingTask(getActiveSession(state)),
  });
  elements.routingStatus.textContent = describeRoutingChoice(choice, { t });
}

function renderCostPanel() {
  const budget = state.usageBudget ?? { currency: 'USD' };
  elements.budgetDaily.value = budget.dailyLimit ?? '';
  elements.budgetMonthly.value = budget.monthlyLimit ?? '';
  elements.budgetCurrency.value = budget.currency ?? 'USD';
  const records = createUsageRecordsFromWebState(state);
  const view = createCostDashboardViewModel(records, { ...budget, now: new Date().toISOString() }, { t });
  elements.costStatus.textContent = t('budget.estimated', { amount: view.totalCostLabel, message: view.budgetMessage });
  const latestDay = view.byDay.at(-1);
  const latestMonth = view.byMonth.at(-1);
  elements.costTrends.innerHTML = [
    `<li>${escapeHtml(t('budget.latestDay'))} <span>${escapeHtml(latestDay ? `${latestDay.key} / ${t('usage.tokens', { count: latestDay.totalTokens })}` : t('budget.noUsage'))}</span></li>`,
    `<li>${escapeHtml(t('budget.latestMonth'))} <span>${escapeHtml(latestMonth ? `${latestMonth.key} / ${t('usage.tokens', { count: latestMonth.totalTokens })}` : t('budget.noUsage'))}</span></li>`,
  ].join('');
}

function renderSyncPanel(plan = createLocalPreviewPlan(state)) {
  const settings = state.syncSettings ?? {};
  const view = createSyncDashboardViewModel(settings, plan, { t });
  elements.syncEnabled.value = settings.enabled ? 'enabled' : 'disabled';
  elements.syncEndpoint.value = settings.endpoint ?? '';
  elements.syncTargets.value = syncTargetCsv(settings);
  elements.syncStatus.textContent = `${view.enabledLabel}. ${view.statusLabel}`;
  elements.syncCounts.innerHTML = [
    `<li>${escapeHtml(t('sync.upload'))} <span>${view.counts.upload}</span></li>`,
    `<li>${escapeHtml(t('sync.download'))} <span>${view.counts.download}</span></li>`,
    `<li>${escapeHtml(t('sync.conflicts'))} <span>${view.counts.conflicts}</span></li>`,
  ].join('');
}

function renderBackupPanel() {
  const archive = createWebBackupArchive(state);
  elements.backupStatus.textContent = t('backup.readyDetail', { summary: summarizeBackupArchive(archive, { t }) });
}

function renderAdvancedSettingsPanel() {
  const platform = detectAdvancedPlatform();
  const desktop = platform === 'desktop';
  const view = createAdvancedSettingsViewModel(state.advancedSettings, { platform, desktopCapabilities: desktopCapabilitySummary });
  const settings = view.settings;

  elements.ragEnabled.checked = settings.rag.enabled;
  elements.ragSourceScope.value = settings.rag.sourceScope;
  elements.ragEmbeddingProvider.value = settings.rag.embeddingProvider;
  elements.ragIndexMode.value = settings.rag.indexMode;
  elements.ragRetrievalMode.value = settings.rag.retrievalMode;
  elements.ragMaxChunks.value = settings.rag.maxChunks;
  elements.ragRequireCitations.checked = settings.rag.requireCitations;
  elements.ragReranking.checked = settings.rag.rerankingEnabled;
  elements.ragStatus.textContent = t('advanced.ragSummary', {
    scope: settings.rag.sourceScope,
    retrieval: settings.rag.retrievalMode,
    chunks: settings.rag.maxChunks,
  });

  elements.webSearchEnabled.checked = settings.webSearch.enabled;
  elements.webSearchProviderType.value = settings.webSearch.providerType;
  elements.webSearchProviderName.value = settings.webSearch.providerName;
  elements.webSearchEndpoint.value = settings.webSearch.endpoint;
  elements.webSearchMaxResults.value = settings.webSearch.maxResults;
  elements.webSearchGrounded.checked = settings.webSearch.groundedAnswers;
  elements.webSearchDesktopProxy.checked = desktop && settings.webSearch.desktopProxy;
  elements.webSearchDesktopProxy.disabled = !desktop;
  elements.webSearchStatus.textContent = t('advanced.webSearchSummary', {
    provider: settings.webSearch.providerName,
    results: settings.webSearch.maxResults,
  });

  elements.httpMcpEnabled.checked = settings.mcp.httpEnabled;
  elements.httpMcpName.value = settings.mcp.httpServerName;
  elements.httpMcpEndpoint.value = settings.mcp.httpEndpoint;
  elements.httpMcpTools.value = settings.mcp.httpTools.join(', ');
  elements.pluginManagerEnabled.checked = desktop && settings.mcp.pluginManagerEnabled;
  elements.stdioMcpEnabled.checked = desktop && settings.mcp.stdioMcpEnabled;
  elements.pluginManagerEnabled.disabled = !desktop;
  elements.stdioMcpEnabled.disabled = !desktop;
  elements.mcpRequireConfirmation.checked = true;
  elements.mcpStatus.textContent = desktop ? t('advanced.mcpDesktopSummary') : t('advanced.mcpSharedSummary');

  elements.codeExecutionEnabled.checked = desktop && settings.codeExecution.enabled;
  elements.codeExecutionEnabled.disabled = !desktop;
  elements.codeExecutionLanguage.value = settings.codeExecution.language;
  elements.codeExecutionLanguage.disabled = !desktop;
  elements.codeExecutionTimeout.value = settings.codeExecution.timeoutMs;
  elements.codeExecutionTimeout.disabled = !desktop;
  elements.codeExecutionConfirmation.checked = true;
  elements.codeExecutionStatus.textContent = desktop ? t('advanced.codeDesktopSummary') : t('advanced.codeUnavailableSummary');

  elements.advancedPlatformStatus.textContent = t('advanced.capabilitySummary', {
    platform,
    count: view.enabledCount,
  });
  elements.advancedCapabilityList.innerHTML = renderAdvancedSettingsSummary(view);
}

function parsePromptTemplateValues() {
  const raw = elements.promptTemplateValues.value.trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(t('prompt.variablesObjectOnly'));
    }
    return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value)]));
  } catch (error) {
    const message = error instanceof Error ? error.message : t('prompt.invalidJson');
    elements.promptTemplateStatus.textContent = t('prompt.variablesError', { message });
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
