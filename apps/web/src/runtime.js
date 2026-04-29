import {
  addAttachmentToActiveSession,
  addMessageToActiveSession,
  addSession,
  createAssistantEchoMessage,
  createInitialWebState,
  createProviderFromForm,
  createSession,
  createTextMessage,
  getActiveSession,
  parseState,
  serializeState,
  summarizeUsage,
  upsertProvider,
} from './web-state.js';
import { compareProvidersInBrowser, formatComparisonResult } from './model-comparison.js';
import { defaultModel, streamChatInBrowser, validateProviderInBrowser } from './provider-runtime.js';

const STORAGE_KEY = 'hello-world:web-state:v1';
const providerSecrets = new Map();
let activeAbortController;
let state = parseState(localStorage.getItem(STORAGE_KEY));
let comparisonPrompt = '';
let comparisonResults = [];

const elements = {
  attachments: document.querySelector('#attachments'),
  compareModels: document.querySelector('#compare-models'),
  comparisonResults: document.querySelector('#comparison-results'),
  composer: document.querySelector('#composer'),
  fileInput: document.querySelector('#file-input'),
  messages: document.querySelector('#messages'),
  newSession: document.querySelector('#new-session'),
  prompt: document.querySelector('#prompt'),
  providerBaseUrl: document.querySelector('#provider-base-url'),
  providerModel: document.querySelector('#provider-model'),
  providerName: document.querySelector('#provider-name'),
  providerApiKey: document.querySelector('#provider-api-key'),
  providerStatus: document.querySelector('#provider-status'),
  providerType: document.querySelector('#provider-type'),
  saveProvider: document.querySelector('#save-provider'),
  sessionList: document.querySelector('#session-list'),
  sessionTitle: document.querySelector('#session-title'),
  stopGeneration: document.querySelector('#stop-generation'),
  usageSummary: document.querySelector('#usage-summary'),
};

function saveState() {
  localStorage.setItem(STORAGE_KEY, serializeState(state));
}

function render() {
  const session = getActiveSession(state) ?? createInitialWebState().sessions[0];
  elements.sessionTitle.textContent = session.title;
  elements.sessionList.innerHTML = state.sessions.map((item) => `
    <button class="session-item ${item.id === session.id ? 'active' : ''}" data-session-id="${escapeHtml(item.id)}" type="button">
      ${escapeHtml(item.title)}
    </button>
  `).join('');
  elements.messages.innerHTML = session.messages.length === 0
    ? '<div class="empty-state">Start a local-first chat. Configure Ollama or an OpenAI-compatible endpoint to stream a real provider response; otherwise local echo is used.</div>'
    : session.messages.map(renderMessage).join('');
  const usage = summarizeUsage(session);
  elements.usageSummary.textContent = `${usage.totalTokens} tokens`;
  elements.attachments.innerHTML = (session.attachments ?? []).map((attachment) => `<span class="attachment-chip">${escapeHtml(attachment.name)}</span>`).join('');
  elements.comparisonResults.innerHTML = renderComparisonResults();
  const provider = state.providers[0];
  elements.providerStatus.textContent = provider
    ? `Saved ${provider.name} (${provider.defaultModelId ?? defaultModel(provider.type)}). API keys stay in memory for this browser tab.`
    : 'No provider configured. Local echo mode is active.';
}

function renderMessage(message) {
  const text = message.content.filter((item) => item.type === 'text').map((item) => item.text).join('\n');
  return `<article class="message ${message.role}"><strong>${message.role}</strong><p>${escapeHtml(text)}</p></article>`;
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
  const provider = state.providers[0];
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
      modelId: provider.defaultModelId ?? defaultModel(provider.type),
      apiKey: providerSecrets.get(provider.id),
      signal: activeAbortController.signal,
      messages: getActiveSession(state).messages.map((message) => ({ role: message.role, content: message.content.filter((item) => item.type === 'text').map((item) => item.text).join('\n') })),
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
      messages: textMessagesForProvider(getActiveSession(state)),
    });
    elements.providerStatus.textContent = `Comparison finished. Pick one answer to save as the main branch.`;
  } finally {
    elements.compareModels.disabled = false;
    render();
  }
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
    elements.providerStatus.textContent = `Connected. ${models.slice(0, 3).join(', ') || 'No models returned.'}`;
  } catch (error) {
    elements.providerStatus.textContent = `Saved, but validation failed: ${error instanceof Error ? error.message : 'unknown error'}`;
  }
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => undefined);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function textMessagesForProvider(session) {
  return session.messages.map((message) => ({
    role: message.role,
    content: message.content.filter((item) => item.type === 'text').map((item) => item.text).join('\n'),
  }));
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

function detectBrowserFileKind(file) {
  const name = file.name.toLowerCase();
  if (file.type.startsWith('image/')) return 'image';
  if (name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.docx')) return 'docx';
  if (name.endsWith('.xlsx')) return 'xlsx';
  if (name.endsWith('.md') || name.endsWith('.markdown')) return 'markdown';
  return 'text';
}

render();
