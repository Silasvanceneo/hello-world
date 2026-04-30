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
import { detectLocalOllama } from './native-desktop.js';
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

const elements = {
  attachments: document.querySelector('#attachments'),
  compareModels: document.querySelector('#compare-models'),
  comparisonResults: document.querySelector('#comparison-results'),
  composer: document.querySelector('#composer'),
  capturePhoto: document.querySelector('#capture-photo'),
  captureScreen: document.querySelector('#capture-screen'),
  fileInput: document.querySelector('#file-input'),
  messages: document.querySelector('#messages'),
  newSession: document.querySelector('#new-session'),
  pasteImage: document.querySelector('#paste-image'),
  prompt: document.querySelector('#prompt'),
  providerBaseUrl: document.querySelector('#provider-base-url'),
  detectLocalOllama: document.querySelector('#detect-local-ollama'),
  providerModel: document.querySelector('#provider-model'),
  providerName: document.querySelector('#provider-name'),
  providerApiKey: document.querySelector('#provider-api-key'),
  providerStatus: document.querySelector('#provider-status'),
  providerType: document.querySelector('#provider-type'),
  saveProvider: document.querySelector('#save-provider'),
  sessionList: document.querySelector('#session-list'),
  sessionTitle: document.querySelector('#session-title'),
  stopGeneration: document.querySelector('#stop-generation'),
  speakLast: document.querySelector('#speak-last'),
  usageSummary: document.querySelector('#usage-summary'),
  voiceInput: document.querySelector('#voice-input'),
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
    ? renderEmptyState()
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
  const label = message.role === 'assistant' ? 'Assistant' : 'You';
  const avatar = message.role === 'assistant'
    ? '<img src="./brand-icon.png" alt="" />'
    : '<span>Y</span>';
  return `<article class="message ${message.role}">
    <div class="message-avatar" aria-hidden="true">${avatar}</div>
    <div class="message-bubble">
      <strong>${escapeHtml(label)}</strong>
      <p>${escapeHtml(text)}</p>
    </div>
  </article>`;
}

function renderEmptyState() {
  return `<div class="empty-state">
    <figure class="mascot-card">
      <img src="./brand-icon.png" alt="" />
      <figcaption>hello-world assistant</figcaption>
    </figure>
    <p class="eyebrow">Local-first, multi-model, private by default</p>
    <h3>Ask less.<br />Know more.</h3>
    <p>Connect Ollama or an OpenAI-compatible endpoint, then chat with files, screenshots, camera images, voice input, and model comparison.</p>
    <div class="prompt-suggestions" aria-label="Prompt ideas">
      <span>Explain this PDF</span>
      <span>Compare two models</span>
      <span>Analyze a screenshot</span>
      <span>Draft a plan</span>
    </div>
  </div>`;
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
