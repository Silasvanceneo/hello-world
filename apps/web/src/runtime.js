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

const STORAGE_KEY = 'hello-world:web-state:v1';
let state = parseState(localStorage.getItem(STORAGE_KEY));

const elements = {
  attachments: document.querySelector('#attachments'),
  composer: document.querySelector('#composer'),
  fileInput: document.querySelector('#file-input'),
  messages: document.querySelector('#messages'),
  newSession: document.querySelector('#new-session'),
  prompt: document.querySelector('#prompt'),
  providerBaseUrl: document.querySelector('#provider-base-url'),
  providerName: document.querySelector('#provider-name'),
  providerApiKey: document.querySelector('#provider-api-key'),
  providerStatus: document.querySelector('#provider-status'),
  providerType: document.querySelector('#provider-type'),
  saveProvider: document.querySelector('#save-provider'),
  sessionList: document.querySelector('#session-list'),
  sessionTitle: document.querySelector('#session-title'),
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
    ? '<div class="empty-state">Start a local-first chat. Provider streaming hooks are ready; this Web MVP uses local echo until a live provider is connected.</div>'
    : session.messages.map(renderMessage).join('');
  const usage = summarizeUsage(session);
  elements.usageSummary.textContent = `${usage.totalTokens} tokens`;
  elements.attachments.innerHTML = (session.attachments ?? []).map((attachment) => `<span class="attachment-chip">${escapeHtml(attachment.name)}</span>`).join('');
  elements.providerStatus.textContent = state.providers[0]
    ? `Saved ${state.providers[0].name}. Secrets are kept in browser storage for this P0 shell only.`
    : 'No provider configured.';
}

function renderMessage(message) {
  const text = message.content.filter((item) => item.type === 'text').map((item) => item.text).join('
');
  return `<article class="message ${message.role}"><strong>${message.role}</strong><p>${escapeHtml(text)}</p></article>`;
}

elements.composer.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = elements.prompt.value.trim();
  if (!text) {
    return;
  }
  state = addMessageToActiveSession(state, createTextMessage('user', text));
  state = addMessageToActiveSession(state, createAssistantEchoMessage(text));
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

elements.saveProvider.addEventListener('click', () => {
  const provider = createProviderFromForm({
    name: elements.providerName.value,
    type: elements.providerType.value,
    baseUrl: elements.providerBaseUrl.value,
    apiKey: elements.providerApiKey.value,
  });
  state = upsertProvider(state, provider);
  elements.providerApiKey.value = '';
  saveState();
  render();
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
