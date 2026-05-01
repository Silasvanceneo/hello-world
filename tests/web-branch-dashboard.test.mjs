import assert from 'node:assert/strict';
import test from 'node:test';
import { bindBranchDashboard, renderBranchResults } from '../apps/web/src/branch-dashboard.js';
import {
  addMessageToActiveSession,
  createInitialWebState,
  createMessageBranch,
  createTextMessage,
  getActiveSession,
} from '../apps/web/src/web-state.js';

test('web branch dashboard escapes branch labels and source message ids', () => {
  let state = createInitialWebState('2026-05-02T02:00:00.000Z');
  state = addMessageToActiveSession(state, createTextMessage('assistant', 'Draft', '2026-05-02T02:01:00.000Z', 'assistant-<script>'));
  state = createMessageBranch(state, {
    fromMessageId: 'assistant-<script>',
    title: '<img src=x onerror=alert(1)>',
    messages: [createTextMessage('assistant', 'Safe branch', '2026-05-02T02:02:00.000Z', 'branch-message')],
  }, '2026-05-02T02:03:00.000Z', 'branch-1');

  const html = renderBranchResults(getActiveSession(state));

  assert.equal(html.includes('<img src=x onerror=alert(1)>'), false);
  assert.equal(html.includes('assistant-<script>'), false);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /assistant-&lt;script&gt;/);
});

test('web branch dashboard creates a branch from the latest assistant reply', () => {
  let state = createInitialWebState('2026-05-02T02:00:00.000Z');
  state = addMessageToActiveSession(state, createTextMessage('user', 'Write a note', '2026-05-02T02:01:00.000Z', 'user-1'));
  state = addMessageToActiveSession(state, createTextMessage('assistant', 'First answer', '2026-05-02T02:02:00.000Z', 'assistant-1'));
  const calls = [];
  const listeners = new Map();
  const elements = {
    branchLast: {
      addEventListener: (eventName, listener) => listeners.set(eventName, listener),
    },
    providerStatus: {
      textContent: '',
    },
  };

  bindBranchDashboard({
    elements,
    getState: () => state,
    setState: (nextState) => { state = nextState; },
    saveState: () => calls.push('save'),
    render: () => calls.push('render'),
  });
  listeners.get('click')();

  const branch = getActiveSession(state).branches[0];
  assert.equal(branch.fromMessageId, 'assistant-1');
  assert.equal(branch.messages[0]?.content[0]?.text, 'First answer');
  assert.deepEqual(calls, ['save', 'render']);
  assert.equal(elements.providerStatus.textContent, 'Latest assistant reply saved as a local branch.');
});
