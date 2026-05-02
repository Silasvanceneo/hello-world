export function bindSettingsView({
  root = document.body,
  settingsTriggers,
  chatTriggers,
  focusTarget,
  scrollTarget,
  initialHash = globalThis.location?.hash,
} = {}) {
  const showChat = () => setActiveView({ root, view: 'chat', focusTarget, scrollTarget });
  const showSettings = () => setActiveView({ root, view: 'settings' });

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

  if (initialHash === '#settings') {
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
