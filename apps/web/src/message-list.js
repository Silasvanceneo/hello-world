const defaultWindowSize = 80;

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
  const view = createMessageListViewModel(session, options);
  if (view.totalMessages === 0) {
    return renderEmptyState();
  }
  const lastAssistantId = [...(session.messages ?? [])].reverse().find((message) => message.role === 'assistant')?.id;
  return [
    view.isWindowed
      ? `<button class="secondary-button" data-expand-messages="${escapeHtml(session.id)}" type="button">Show ${view.hiddenBefore} earlier messages</button>`
      : '',
    ...view.visibleMessages.map((message) => renderMessage(message, { canRetry: message.id === lastAssistantId })),
  ].filter(Boolean).join('');
}

export function bindMessageListWindow({ elements, getSession, expandSession, editMessage, retryLastAssistant, render }) {
  elements.messages.addEventListener('click', (event) => {
    const session = getSession();
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
  const text = message.content.filter((item) => item.type === 'text').map((item) => item.text).join('\n');
  const label = message.role === 'assistant' ? 'Assistant' : 'You';
  const avatar = message.role === 'assistant'
    ? '<img src="./brand-icon.png" alt="" />'
    : '<span>Y</span>';
  return `<article class="message ${escapeHtml(message.role)}">
    <div class="message-avatar" aria-hidden="true">${avatar}</div>
    <div class="message-bubble">
      <strong>${escapeHtml(label)}</strong>
      <p>${escapeHtml(text)}</p>
      ${renderMessageActions(message, options)}
    </div>
  </article>`;
}

function renderMessageActions(message, options) {
  if (message.role === 'user') {
    return `<button class="secondary-button" data-edit-message="${escapeHtml(message.id)}" type="button">Edit</button>`;
  }
  if (message.role === 'assistant' && options.canRetry) {
    return `<button class="secondary-button" data-retry-last="${escapeHtml(message.id)}" type="button">Retry</button>`;
  }
  return '';
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
      <span>Summarize a screenshot</span>
    </div>
  </div>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
