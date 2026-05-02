import {
  deleteSessionPermanently,
  moveActiveSessionToTrash,
  restoreSessionFromTrash,
  updateActiveSessionOrganization,
} from './web-state.js';

export function createInitialSessionFilters() {
  return { query: '', archiveFilter: 'active', tag: '' };
}

export function createSessionListViewModel(sessions, filters = {}) {
  const normalizedFilters = normalizeFilters(filters);
  const availableTags = Array.from(new Set(
    sessions.flatMap((session) => Array.isArray(session.tags) ? session.tags : []),
  )).sort((left, right) => left.localeCompare(right));
  const items = sessions
    .filter((session) => matchesArchiveFilter(session, normalizedFilters.archiveFilter))
    .filter((session) => matchesTag(session, normalizedFilters.tag))
    .filter((session) => matchesQuery(session, normalizedFilters.query))
    .sort(compareSessions)
    .map((session) => ({
      id: session.id,
      title: session.title || 'Untitled chat',
      tags: Array.isArray(session.tags) ? session.tags : [],
      pinned: Boolean(session.pinned),
      archived: Boolean(session.archived),
      deleted: Boolean(session.deletedAt),
      active: session.id === normalizedFilters.activeSessionId,
      updatedAt: session.updatedAt,
      messageCount: Array.isArray(session.messages) ? session.messages.length : 0,
    }));

  return {
    items,
    availableTags,
    counts: {
      total: sessions.length,
      active: sessions.filter((session) => !session.archived && !session.deletedAt).length,
      archived: sessions.filter((session) => session.archived && !session.deletedAt).length,
      deleted: sessions.filter((session) => session.deletedAt).length,
    },
    emptyKey: createEmptyKey(normalizedFilters),
    emptyLabel: createEmptyLabel(normalizedFilters),
  };
}

const defaultT = (key, values = {}) => {
  const defaults = {
    'session.badge.pinned': 'Pinned',
    'session.badge.archived': 'Archived',
    'session.badge.trash': 'Trash',
    'session.allTags': 'All tags',
    'session.status': '{active} active / {archived} archived / {total} total',
    'session.messageCount.one': '{count} message',
    'session.messageCount.many': '{count} messages',
  };
  const template = defaults[key] ?? key;
  return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), template);
};

export function renderSessionListItems(view, { t = defaultT } = {}) {
  if (view.items.length === 0) {
    return `<p class="session-empty">${escapeHtml(view.emptyKey ? t(view.emptyKey) : view.emptyLabel)}</p>`;
  }
  return view.items.map((item) => {
    const stateBadges = [
      item.pinned ? t('session.badge.pinned') : undefined,
      item.archived ? t('session.badge.archived') : undefined,
      item.deleted ? t('session.badge.trash') : undefined,
      ...item.tags,
    ].filter(Boolean);
    return `<button class="session-item ${item.active ? 'active' : ''}" data-session-id="${escapeHtml(item.id)}" type="button">
      <span class="session-title-text">${escapeHtml(item.title)}</span>
      <small class="session-meta">${escapeHtml(formatMessageCount(item.messageCount, t))}</small>
      ${stateBadges.length > 0
        ? `<span class="session-badges">${stateBadges.map((badge) => `<em>${escapeHtml(badge)}</em>`).join('')}</span>`
        : ''}
    </button>`;
  }).join('');
}

export function renderSessionOrganizer({ state, session, filters, elements, t = defaultT }) {
  const sessionView = createSessionListViewModel(state.sessions, { ...filters, activeSessionId: session.id });
  elements.sessionList.innerHTML = renderSessionListItems(sessionView, { t });
  elements.sessionTagFilter.innerHTML = [
    `<option value="">${escapeHtml(t('session.allTags'))}</option>`,
    ...sessionView.availableTags.map((tag) => `<option value="${escapeHtml(tag)}">${escapeHtml(tag)}</option>`),
  ].join('');
  elements.sessionTagFilter.value = filters.tag;
  elements.sessionSearch.value = filters.query;
  elements.sessionArchiveFilter.value = filters.archiveFilter;
  elements.sessionTags.value = (session.tags ?? []).join(', ');
  elements.sessionPinned.checked = Boolean(session.pinned);
  elements.sessionArchived.checked = Boolean(session.archived);
  elements.trashSession.hidden = Boolean(session.deletedAt);
  elements.restoreSession.hidden = !session.deletedAt;
  elements.deleteSessionForever.hidden = !session.deletedAt;
  elements.sessionOrganizationStatus.textContent = t('session.status', sessionView.counts);
}

export function bindSessionOrganizer({ elements, getState, setState, getFilters, setFilters, saveState, render }) {
  elements.sessionSearch.addEventListener('input', () => {
    setFilters({ ...getFilters(), query: elements.sessionSearch.value });
    render();
  });

  elements.sessionArchiveFilter.addEventListener('change', () => {
    setFilters({ ...getFilters(), archiveFilter: elements.sessionArchiveFilter.value });
    render();
  });

  elements.sessionTagFilter.addEventListener('change', () => {
    setFilters({ ...getFilters(), tag: elements.sessionTagFilter.value });
    render();
  });

  elements.saveSessionOrganization.addEventListener('click', () => {
    setState(updateActiveSessionOrganization(getState(), {
      tags: elements.sessionTags.value,
      pinned: elements.sessionPinned.checked,
      archived: elements.sessionArchived.checked,
    }));
    if (elements.sessionArchived.checked) {
      setFilters({ ...getFilters(), archiveFilter: 'archived' });
    }
    saveState();
    render();
  });

  elements.trashSession.addEventListener('click', () => {
    setState(moveActiveSessionToTrash(getState()));
    saveState();
    render();
  });

  elements.restoreSession.addEventListener('click', () => {
    const state = getState();
    setState(restoreSessionFromTrash(state, state.activeSessionId));
    setFilters({ ...getFilters(), archiveFilter: 'active' });
    saveState();
    render();
  });

  elements.deleteSessionForever.addEventListener('click', () => {
    const state = getState();
    setState(deleteSessionPermanently(state, state.activeSessionId));
    saveState();
    render();
  });
}

function normalizeFilters(filters) {
  return {
    activeSessionId: filters.activeSessionId,
    archiveFilter: ['active', 'archived', 'deleted', 'all'].includes(filters.archiveFilter) ? filters.archiveFilter : 'active',
    query: String(filters.query ?? '').trim().toLowerCase(),
    tag: String(filters.tag ?? '').trim(),
  };
}

function matchesArchiveFilter(session, archiveFilter) {
  if (archiveFilter === 'deleted') return Boolean(session.deletedAt);
  if (session.deletedAt) return false;
  if (archiveFilter === 'all') return true;
  if (archiveFilter === 'archived') return Boolean(session.archived);
  return !session.archived;
}

function matchesTag(session, tag) {
  if (!tag) return true;
  return (session.tags ?? []).includes(tag);
}

function matchesQuery(session, query) {
  if (!query) return true;
  return searchableText(session).includes(query);
}

function searchableText(session) {
  return [
    session.title,
    ...(session.tags ?? []),
    ...(session.messages ?? []).flatMap((message) => (message.content ?? []).map(contentText)),
  ].join('\n').toLowerCase();
}

function contentText(content) {
  if (content.type === 'text' || content.type === 'reasoning') return content.text;
  if (content.type === 'file') return content.name;
  if (content.type === 'citation') return content.label;
  return '';
}

function compareSessions(left, right) {
  if (Boolean(left.pinned) !== Boolean(right.pinned)) {
    return left.pinned ? -1 : 1;
  }
  const updated = right.updatedAt.localeCompare(left.updatedAt);
  return updated === 0 ? left.title.localeCompare(right.title) : updated;
}

function createEmptyLabel(filters) {
  if (filters.query || filters.tag) return 'No matching conversations.';
  if (filters.archiveFilter === 'archived') return 'No archived conversations.';
  return 'No conversations yet.';
}

function createEmptyKey(filters) {
  if (filters.query || filters.tag) return 'session.empty.matching';
  if (filters.archiveFilter === 'archived') return 'session.empty.archived';
  return 'session.empty.default';
}

function formatMessageCount(count, t) {
  return t(count === 1 ? 'session.messageCount.one' : 'session.messageCount.many', { count });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
