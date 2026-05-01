import { createBranchFromLastAssistant, getSessionBranchView } from './web-state.js';

export function renderBranchResults(session) {
  const view = getSessionBranchView(session);
  if (!view.hasBranches) return '';
  return view.branches.map((branch) => `<article class="comparison-card">
    <strong>${escapeHtml(branch.title)}</strong>
    <p class="comparison-meta">${escapeHtml(`${branch.messageCount} message branch from ${branch.fromMessageId}`)}</p>
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
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
