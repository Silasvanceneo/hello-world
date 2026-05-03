import {
  createAdvancedSettingsViewModel,
  detectAdvancedPlatform,
  renderAdvancedSettingsSummary,
} from './advanced-settings.js';
import { createWebBackupArchive, summarizeBackupArchive } from './backup-dashboard.js';
import { createCostDashboardViewModel, createUsageRecordsFromWebState } from './cost-dashboard.js';
import { chooseProviderForRouting, describeRoutingChoice } from './model-routing.js';
import { createLocalPreviewPlan, createSyncDashboardViewModel } from './sync-dashboard.js';
import {
  getActiveAgentPreset,
  getActivePromptTemplate,
  getActiveSession,
} from './web-state.js';
import { escapeHtml, inferRoutingTask, syncTargetCsv } from './runtime-helpers.js';

export function renderAgentPresetPanel({ elements, state, t }) {
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

export function renderPromptTemplatePanel({ elements, state, t }) {
  const active = getActivePromptTemplate(state);
  elements.promptTemplateSelect.innerHTML = [
    `<option value="">${escapeHtml(t('prompt.noTemplate'))}</option>`,
    ...state.promptTemplates.map((template) => `<option value="${escapeHtml(template.id)}">${escapeHtml(template.favorite ? `* ${template.title}` : template.title)}</option>`),
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

export function renderRoutingPanel({ elements, state, t }) {
  const strategy = state.routingStrategy ?? 'balanced';
  elements.routingStrategy.value = strategy;
  const choice = chooseProviderForRouting(state.providers, {
    strategy,
    task: inferRoutingTask(getActiveSession(state)),
  });
  elements.routingStatus.textContent = describeRoutingChoice(choice, { t });
}

export function renderCostPanel({ elements, state, t, now = new Date().toISOString() }) {
  const budget = state.usageBudget ?? { currency: 'USD' };
  elements.budgetDaily.value = budget.dailyLimit ?? '';
  elements.budgetMonthly.value = budget.monthlyLimit ?? '';
  elements.budgetCurrency.value = budget.currency ?? 'USD';
  const records = createUsageRecordsFromWebState(state);
  const view = createCostDashboardViewModel(records, { ...budget, now }, { t });
  elements.costStatus.textContent = t('budget.estimated', { amount: view.totalCostLabel, message: view.budgetMessage });
  const latestDay = view.byDay.at(-1);
  const latestMonth = view.byMonth.at(-1);
  elements.costTrends.innerHTML = [
    `<li>${escapeHtml(t('budget.latestDay'))} <span>${escapeHtml(latestDay ? `${latestDay.key} / ${t('usage.tokens', { count: latestDay.totalTokens })}` : t('budget.noUsage'))}</span></li>`,
    `<li>${escapeHtml(t('budget.latestMonth'))} <span>${escapeHtml(latestMonth ? `${latestMonth.key} / ${t('usage.tokens', { count: latestMonth.totalTokens })}` : t('budget.noUsage'))}</span></li>`,
  ].join('');
}

export function renderSyncPanel({ elements, state, t, plan = createLocalPreviewPlan(state) }) {
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

export function renderBackupPanel({ elements, state, t }) {
  const archive = createWebBackupArchive(state);
  elements.backupStatus.textContent = t('backup.readyDetail', { summary: summarizeBackupArchive(archive, { t }) });
}

export function renderAdvancedSettingsPanel({
  elements,
  state,
  t,
  desktopCapabilitySummary,
  platform = detectAdvancedPlatform(),
}) {
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
