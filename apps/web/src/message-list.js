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
  return [
    view.isWindowed
      ? `<button class="secondary-button" data-expand-messages="${escapeHtml(session.id)}" type="button">Show ${view.hiddenBefore} earlier messages</button>`
      : '',
    ...view.visibleMessages.map(renderMessage),
  ].filter(Boolean).join('');
}

export function bindMessageListWindow({ elements, getSession, expandSession, render }) {
  elements.messages.addEventListener('click', (event) => {
    const button = event.target.closest('[data-expand-messages]');
    if (!button) {
      return;
    }
    const session = getSession();
    if (!session || button.dataset.expandMessages !== session.id) {
      return;
    }
    expandSession(session.id);
    render();
  });
}

function renderMessage(message) {
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
