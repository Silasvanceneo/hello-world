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
import { defaultModel, streamChatInBrowser, validateProviderInBrowser } from './provider-runtime.js';

const STORAGE_KEY = 'hello-world:web-state:v1';
const providerSecrets = new Map();
let activeAbortController;
let state = parseState(localStorage.getItem(STORAGE_KEY));

const elements = {
  attachments: document.querySelector('#attachments'),
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
  const provider = state.providers[0];
  elements.providerStatus.textContent = provider
    ? `Saved ${provider.name} (${provider.defaultModelId ?? defaultModel(provider.type)}). API keys stay in memory for this browser tab.`
    : 'No provider configured. Local echo mode is active.';
}

function renderMessage(message) {
  const text = message.content.filter((item) => item.type === 'text').map((item) => item.text).join('
');
  return `<article class="message ${message.role}"><strong>${message.role}</strong><p>${escapeHtml(text)}</p></article>`;
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
      messages: getActiveSession(state).messages.map((message) => ({ role: message.role, content: message.content.filter((item) => item.type === 'text').map((item) => item.text).join('
') })),
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
  const files = Array.from(elements.fileInput.files ?? []);
  for (const file of files) {
    state = addAttachmentToActiveSession(state, {
      id: crypto.randomUUID(),
      kind: file.type.startsWith('image/') ? 'image' : file.name.endsWith('.pdf') ? 'pdf' : 'text',
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      createdAt: new Date().toISOString(),
    });
  }
  elements.fileInput.value = '';
  saveState();
  render();
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

render();
