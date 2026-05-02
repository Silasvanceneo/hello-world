const defaultWindowSize = 80;
const defaultT = (key, values = {}) => {
  const defaults = {
    'message.assistant': 'Assistant',
    'message.you': 'You',
    'message.edit': 'Edit',
    'message.retry': 'Retry',
    'message.now': 'now',
    'message.showEarlier': 'Show {count} earlier messages',
    'empty.caption': 'hello-world assistant',
    'empty.eyebrow': 'Local-first, multi-model, private by default',
    'empty.title': 'Start a focused workspace.',
    'empty.description': 'Use local providers, files, screenshots, voice, and model comparison from one chat surface.',
    'starter.files.label': 'Plan with files',
    'starter.files.prompt': 'Review these files and turn them into a clear action plan.',
    'starter.models.label': 'Compare models',
    'starter.models.prompt': 'Answer this with two different models and show the tradeoffs.',
    'starter.screenshot.label': 'Explain a screenshot',
    'starter.screenshot.prompt': 'Analyze this screenshot and explain what matters most.',
  };
  const template = defaults[key] ?? key;
  return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), template);
};

export function createMessageListViewModel(session, { expanded = false, windowSize = defaultWindowSize } = {}) {
  const messages = session.messages ?? [];
  const safeWindowSize = Math.max(1, Number(windowSize) || defaultWindowSize);
  const hiddenBefore = expanded ? 0 : Math.max(0, messages.length - safeWindowSize);
  return {
    totalMessages: messages.length,
    hiddenBefore,
    visibleMessages: hiddenBefore > 0 ? messages.slice(hiddenBefore) : messages,
    isWindowed: hiddenBefore > 0,
  };
}

export function renderMessageList(session, options = {}) {
  const t = options.t ?? defaultT;
  const view = createMessageListViewModel(session, options);
  if (view.totalMessages === 0) {
    return renderEmptyState(t);
  }
  const lastAssistantId = [...(session.messages ?? [])].reverse().find((message) => message.role === 'assistant')?.id;
  return [
    view.isWindowed
      ? `<button class="secondary-button" data-expand-messages="${escapeHtml(session.id)}" type="button">${escapeHtml(t('message.showEarlier', { count: view.hiddenBefore }))}</button>`
      : '',
    ...view.visibleMessages.map((message) => renderMessage(message, { canRetry: message.id === lastAssistantId, t })),
  ].filter(Boolean).join('');
}

export function bindMessageListWindow({
  elements,
  getSession,
  expandSession,
  editMessage,
  retryLastAssistant,
  render,
  promptTarget,
}) {
  elements.messages.addEventListener('click', (event) => {
    const session = getSession();
    const starterButton = event.target.closest('[data-prompt-starter]');
    if (starterButton?.dataset?.promptStarter) {
      applyPromptStarter({ button: starterButton, promptTarget });
      return;
    }

    const button = event.target.closest('[data-expand-messages]');
    if (session && button && button.dataset.expandMessages === session.id) {
      expandSession(session.id);
      render();
      return;
    }

    const editButton = event.target.closest('[data-edit-message]');
    if (editButton) {
      editMessage?.(editButton.dataset.editMessage);
      return;
    }

    const retryButton = event.target.closest('[data-retry-last]');
    if (retryButton) {
      retryLastAssistant?.();
      return;
    }
  });
}

function renderMessage(message, options = {}) {
  const t = options.t ?? defaultT;
  const text = message.content.filter((item) => item.type === 'text').map((item) => item.text).join('\n');
  const label = message.role === 'assistant' ? t('message.assistant') : t('message.you');
  const timestamp = formatMessageTime(message.createdAt, t);
  const avatar = message.role === 'assistant'
    ? '<img src="./brand-icon.png" alt="" />'
    : '<span>Y</span>';
  return `<article class="message ${escapeHtml(message.role)}">
    <div class="message-avatar" aria-hidden="true">${avatar}</div>
    <div class="message-bubble">
      <div class="message-meta">
        <strong>${escapeHtml(label)}</strong>
        <time datetime="${escapeHtml(message.createdAt)}">${escapeHtml(timestamp)}</time>
      </div>
      <p>${escapeHtml(text)}</p>
      ${renderMessageActions(message, options)}
    </div>
  </article>`;
}

function renderMessageActions(message, options) {
  const t = options.t ?? defaultT;
  if (message.role === 'user') {
    return `<button class="secondary-button" data-edit-message="${escapeHtml(message.id)}" type="button">${escapeHtml(t('message.edit'))}</button>`;
  }
  if (message.role === 'assistant' && options.canRetry) {
    return `<button class="secondary-button" data-retry-last="${escapeHtml(message.id)}" type="button">${escapeHtml(t('message.retry'))}</button>`;
  }
  return '';
}

function renderEmptyState(t = defaultT) {
  const starters = [
    {
      label: t('starter.files.label'),
      prompt: t('starter.files.prompt'),
    },
    {
      label: t('starter.models.label'),
      prompt: t('starter.models.prompt'),
    },
    {
      label: t('starter.screenshot.label'),
      prompt: t('starter.screenshot.prompt'),
    },
  ];
  return `<div class="empty-state">
    <div class="empty-copy">
      <figure class="mascot-card">
        <img src="./brand-icon.png" alt="" />
        <figcaption>${escapeHtml(t('empty.caption'))}</figcaption>
      </figure>
      <p class="eyebrow">${escapeHtml(t('empty.eyebrow'))}</p>
      <h3>${escapeHtml(t('empty.title'))}</h3>
      <p>${escapeHtml(t('empty.description'))}</p>
    </div>
    <div class="prompt-suggestions" aria-label="Prompt starters">
      ${starters.map((starter) => `<button class="prompt-starter" type="button" data-prompt-starter="${escapeHtml(starter.prompt)}">
        <span>${escapeHtml(starter.label)}</span>
        <small>${escapeHtml(starter.prompt)}</small>
      </button>`).join('')}
    </div>
  </div>`;
}

function applyPromptStarter({ button, promptTarget }) {
  const prompt = button?.dataset?.promptStarter;
  if (!prompt || !promptTarget) {
    return;
  }

  promptTarget.value = prompt;
  promptTarget.focus?.();
}

function formatMessageTime(value, t = defaultT) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return t('message.now');
  }

  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
