import {
  addAttachmentToActiveSession,
  addMessageToActiveSession,
  addSession,
  createAgentPresetFromForm,
  createAssistantEchoMessage,
  createInitialWebState,
  createPromptTemplateFromForm,
  createProviderMessagesForActiveAgent,
  createSession,
  createTextMessage,
  createSessionMessageView,
  estimateTokenUsageFromMessages,
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
import { detectAdvancedPlatform } from './advanced-settings.js';
import { bindBranchDashboard, renderBranchResults } from './branch-dashboard.js';
import { bindComposerDraftActions } from './composer-drafts.js';
import { createLocalPreviewPlan, createSyncDashboardViewModel } from './sync-dashboard.js';
import { bindSessionOrganizer, createInitialSessionFilters, renderSessionOrganizer } from './session-organizer.js';
import { chooseProviderForRouting } from './model-routing.js';
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
import { defaultImageModel, defaultModel, generateImageInBrowser, streamChatInBrowser, validateProviderInBrowser } from './provider-runtime.js';
import { queryRuntimeElements } from './runtime-elements.js';
import {
  addBrowserFilesToState,
  addGeneratedImageResultToActiveSession,
  appendPromptText,
  createProviderDraftFromInputs,
  escapeHtml,
  findLastAssistantText,
  inferRoutingTask,
  rememberProviderSecret,
  renderProviderModelOptions,
} from './runtime-helpers.js';
import {
  renderAdvancedSettingsPanel as renderAdvancedSettingsPanelView,
  renderAgentPresetPanel as renderAgentPresetPanelView,
  renderBackupPanel as renderBackupPanelView,
  renderCostPanel as renderCostPanelView,
  renderPromptTemplatePanel as renderPromptTemplatePanelView,
  renderRoutingPanel as renderRoutingPanelView,
  renderSyncPanel as renderSyncPanelView,
} from './runtime-panels.js';

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

const elements = queryRuntimeElements(document);

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
  elements.providerName.value = provider?.name ?? '';
  elements.providerType.value = provider?.type ?? 'openai-compatible';
  elements.providerBaseUrl.value = provider?.baseUrl ?? '';
  elements.providerModel.value = provider?.defaultModelId ?? '';
  elements.providerImageModel.value = provider?.imageModelId ?? defaultImageModel(provider?.type) ?? '';
  elements.providerStatus.textContent = provider
    ? t('provider.saved', { name: provider.name, model: provider.defaultModelId ?? defaultModel(provider.type) })
    : t('provider.localEcho');
  renderAgentPresetPanelView({ elements, state, t });
  renderPromptTemplatePanelView({ elements, state, t });
  renderRoutingPanelView({ elements, state, t });
  renderCostPanelView({ elements, state, t });
  renderSyncPanelView({ elements, state, t });
  renderBackupPanelView({ elements, state, t });
  renderAdvancedSettingsPanelView({ elements, state, t, desktopCapabilitySummary });
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
  let streamedUsage;
  const providerMessages = createProviderMessagesForActiveAgent(state, getActiveSession(state));
  const modelId = getActiveAgentPreset(state)?.defaultModelId ?? routeChoice.modelId ?? provider.defaultModelId ?? defaultModel(provider.type);
  try {
    streamedText = await streamChatInBrowser({
      provider,
      modelId,
      apiKey: providerSecrets.get(provider.id),
      signal: activeAbortController.signal,
      fetch: desktopProviderFetch,
      messages: providerMessages,
      onDelta: (_delta, fullText) => {
        elements.providerStatus.textContent = t('status.streaming', { count: fullText.length });
      },
      onUsage: (usage) => {
        streamedUsage = usage;
      },
    });
    state = addMessageToActiveSession(state, {
      ...createTextMessage('assistant', streamedText || t('status.emptyResponse')),
      modelId,
      usage: streamedUsage ?? estimateTokenUsageFromMessages(providerMessages, streamedText),
    });
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

elements.generateImage.addEventListener('click', async () => {
  const text = elements.prompt.value.trim();
  if (!text || activeAbortController) {
    elements.providerStatus.textContent = t('status.typePromptImage');
    return;
  }
  const routeChoice = chooseProviderForRouting(state.providers, {
    strategy: state.routingStrategy ?? 'balanced',
    task: 'image-generation',
  });
  const provider = routeChoice?.provider;
  if (!provider) {
    elements.providerStatus.textContent = t('status.saveProviderImage');
    return;
  }

  const imageModelId = provider.imageModelId ?? defaultImageModel(provider.type);
  if (!imageModelId) {
    elements.providerStatus.textContent = t('status.imageProviderUnsupported', { type: provider.type });
    return;
  }

  state = addMessageToActiveSession(state, createTextMessage('user', text));
  elements.prompt.value = '';
  saveState();
  render();

  activeAbortController = new AbortController();
  elements.stopGeneration.disabled = false;
  elements.generateImage.disabled = true;
  elements.providerStatus.textContent = t('status.imageGenerating', { model: imageModelId });
  try {
    const result = await generateImageInBrowser({
      provider,
      modelId: imageModelId,
      prompt: text,
      apiKey: providerSecrets.get(provider.id),
      signal: activeAbortController.signal,
      fetch: desktopProviderFetch,
    });
    state = addGeneratedImageResultToActiveSession(state, {
      prompt: text,
      providerId: provider.id,
      modelId: imageModelId,
      result,
      t,
    });
    elements.providerStatus.textContent = t('status.imageGenerated', { count: result.images.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : t('status.unknownProviderError');
    state = addMessageToActiveSession(state, createTextMessage('assistant', t('status.imageGenerationFailed', { message })));
  } finally {
    activeAbortController = undefined;
    elements.stopGeneration.disabled = true;
    elements.generateImage.disabled = false;
    saveState();
    render();
  }
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
    appendPromptText(elements.prompt, transcript);
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
  const provider = createProviderDraftFromInputs(elements);
  rememberProviderSecret(providerSecrets, elements.providerApiKey.value, provider);
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
  const provider = createProviderDraftFromInputs(elements, state.providers[0]?.id);
  rememberProviderSecret(providerSecrets, elements.providerApiKey.value, provider);
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
  renderSyncPanelView({ elements, state, t, plan });
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
  appendPromptText(elements.prompt, rendered.text);
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
    renderAdvancedSettingsPanelView({ elements, state, t, desktopCapabilitySummary });
  })
  .catch(() => undefined);

configureServiceWorker().catch(() => undefined);

function attachBrowserFiles(files) {
  state = addBrowserFilesToState(state, files);
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

async function refreshProviderModels(provider) {
  const models = await validateProviderInBrowser(provider, {
    apiKey: providerSecrets.get(provider.id),
    fetch: desktopProviderFetch,
  });
  renderProviderModelOptions(elements, models);
  return models;
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

render();
