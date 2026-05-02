import {
  createBranchFromLastAssistant,
  getActiveSession,
  getSessionBranchView,
  promoteActiveBranchToMain,
  setActiveSessionBranch,
} from './web-state.js';

const defaultT = (key, values = {}) => {
  const defaults = {
    'branch.meta': '{count} message branch from {id}',
    'branch.previewing': 'Previewing',
    'branch.preview': 'Preview',
    'branch.saveMain': 'Save as main',
    'status.branchSaved': 'Latest assistant reply saved as a local branch.',
    'status.branchFailed': 'Branch creation failed.',
    'status.branchPreviewing': 'Previewing branch: {title}.',
    'status.branchSelected': 'selected branch',
    'status.branchMain': 'Branch saved as the main timeline.',
  };
  const template = defaults[key] ?? key;
  return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), template);
};

export function renderBranchResults(session, { t = defaultT } = {}) {
  const view = getSessionBranchView(session);
  if (!view.hasBranches) return '';
  return view.branches.map((branch) => `<article class="comparison-card">
    <strong>${escapeHtml(branch.title)}</strong>
    <p class="comparison-meta">${escapeHtml(t('branch.meta', { count: branch.messageCount, id: branch.fromMessageId }))}</p>
    <button class="secondary-button" data-preview-branch="${escapeHtml(branch.id)}" type="button">${escapeHtml(branch.active ? t('branch.previewing') : t('branch.preview'))}</button>
    <button class="secondary-button" data-promote-branch="${escapeHtml(branch.id)}" type="button">${escapeHtml(t('branch.saveMain'))}</button>
  </article>`).join('');
}

export function bindBranchDashboard({ elements, getState, setState, saveState, render, getTranslator = () => defaultT }) {
  elements.branchLast.addEventListener('click', () => {
    const t = getTranslator();
    try {
      setState(createBranchFromLastAssistant(getState()));
      saveState();
      render();
      elements.providerStatus.textContent = t('status.branchSaved');
    } catch (error) {
      const message = error instanceof Error ? error.message : t('status.branchFailed');
      elements.providerStatus.textContent = message;
    }
  });
  elements.branchResults?.addEventListener('click', (event) => {
    const t = getTranslator();
    const previewButton = event.target.closest('[data-preview-branch]');
    if (previewButton) {
      setState(setActiveSessionBranch(getState(), previewButton.dataset.previewBranch));
      saveState();
      render();
      const branch = getActiveBranch(getState());
      elements.providerStatus.textContent = t('status.branchPreviewing', { title: branch?.title ?? t('status.branchSelected') });
      return;
    }

    const promoteButton = event.target.closest('[data-promote-branch]');
    if (!promoteButton) {
      return;
    }
    const state = getState();
    const session = getActiveSession(state);
    const activeState = session.activeBranchId === promoteButton.dataset.promoteBranch
      ? state
      : setActiveSessionBranch(state, promoteButton.dataset.promoteBranch);
    setState(promoteActiveBranchToMain(activeState));
    saveState();
    render();
    elements.providerStatus.textContent = t('status.branchMain');
  });
}

function getActiveBranch(state) {
  const session = getActiveSession(state);
  return (session.branches ?? []).find((branch) => branch.id === session.activeBranchId);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
