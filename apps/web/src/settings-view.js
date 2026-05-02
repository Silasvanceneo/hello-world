export function bindSettingsView({
  root = document.body,
  settingsTriggers,
  chatTriggers,
  focusTarget,
  scrollContainer,
  scrollTarget,
  initialHash = globalThis.location?.hash,
} = {}) {
  let savedChatScroll = captureScrollPosition(scrollContainer);
  const showChat = () => {
    const nextView = setActiveView({ root, view: 'chat', focusTarget, scrollTarget });
    restoreScrollPosition(scrollContainer, savedChatScroll);
    return nextView;
  };
  const showSettings = () => {
    savedChatScroll = captureScrollPosition(scrollContainer);
    return setActiveView({ root, view: 'settings' });
  };

  for (const trigger of settingsTriggers ?? []) {
    trigger?.addEventListener('click', (event) => {
      event.preventDefault();
      showSettings();
    });
  }

  for (const trigger of chatTriggers ?? []) {
    trigger?.addEventListener('click', (event) => {
      event.preventDefault();
      showChat();
    });
  }

  if (isSettingsHash(initialHash)) {
    showSettings();
  }

  return { showChat, showSettings };
}

export function setActiveView({ root = document.body, view, focusTarget, scrollTarget } = {}) {
  const nextView = view === 'settings' ? 'settings' : 'chat';
  root.dataset.view = nextView;

  if (nextView === 'chat') {
    scrollTarget?.scrollIntoView?.({ block: 'nearest' });
    focusTarget?.focus?.();
  }

  return nextView;
}

function captureScrollPosition(target) {
  if (!target || typeof target.scrollTop !== 'number') {
    return undefined;
  }

  return {
    left: typeof target.scrollLeft === 'number' ? target.scrollLeft : 0,
    top: target.scrollTop,
  };
}

function restoreScrollPosition(target, position) {
  if (!target || !position) {
    return;
  }

  if (typeof target.scrollTo === 'function') {
    target.scrollTo({ left: position.left, top: position.top });
    return;
  }

  target.scrollLeft = position.left;
  target.scrollTop = position.top;
}

function isSettingsHash(hash) {
  return typeof hash === 'string' && hash.startsWith('#settings');
}
