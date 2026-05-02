import {
  createBranchFromLastAssistant,
  getActiveSession,
  getSessionBranchView,
  promoteActiveBranchToMain,
  setActiveSessionBranch,
} from './web-state.js';

export function renderBranchResults(session) {
  const view = getSessionBranchView(session);
  if (!view.hasBranches) return '';
  return view.branches.map((branch) => `<article class="comparison-card">
    <strong>${escapeHtml(branch.title)}</strong>
    <p class="comparison-meta">${escapeHtml(`${branch.messageCount} message branch from ${branch.fromMessageId}`)}</p>
    <button class="secondary-button" data-preview-branch="${escapeHtml(branch.id)}" type="button">${branch.active ? 'Previewing' : 'Preview'}</button>
    <button class="secondary-button" data-promote-branch="${escapeHtml(branch.id)}" type="button">Save as main</button>
  </article>`).join('');
}

export function bindBranchDashboard({ elements, getState, setState, saveState, render }) {
  elements.branchLast.addEventListener('click', () => {
    try {
      setState(createBranchFromLastAssistant(getState()));
      saveState();
      render();
      elements.providerStatus.textContent = 'Latest assistant reply saved as a local branch.';
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Branch creation failed.';
      elements.providerStatus.textContent = message;
    }
  });
  elements.branchResults?.addEventListener('click', (event) => {
    const previewButton = event.target.closest('[data-preview-branch]');
    if (previewButton) {
      setState(setActiveSessionBranch(getState(), previewButton.dataset.previewBranch));
      saveState();
      render();
      const branch = getActiveBranch(getState());
      elements.providerStatus.textContent = `Previewing branch: ${branch?.title ?? 'selected branch'}.`;
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
    elements.providerStatus.textContent = 'Branch saved as the main timeline.';
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
