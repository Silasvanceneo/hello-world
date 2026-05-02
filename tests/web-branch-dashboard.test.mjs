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
  assert.match(html, /data-preview-branch="branch-1"/);
  assert.match(html, /data-promote-branch="branch-1"/);
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

test('web branch dashboard previews and promotes a branch from controls', () => {
  let state = createInitialWebState('2026-05-02T05:00:00.000Z');
  state = addMessageToActiveSession(state, createTextMessage('user', 'Draft', '2026-05-02T05:01:00.000Z', 'user-1'));
  state = addMessageToActiveSession(state, createTextMessage('assistant', 'Main answer', '2026-05-02T05:02:00.000Z', 'assistant-1'));
  state = createMessageBranch(state, {
    fromMessageId: 'assistant-1',
    title: 'Short option',
    messages: [createTextMessage('assistant', 'Short answer', '2026-05-02T05:03:00.000Z', 'assistant-branch')],
  }, '2026-05-02T05:04:00.000Z', 'branch-1');
  const calls = [];
  const listeners = new Map();
  const elements = {
    branchLast: {
      addEventListener: (eventName, listener) => listeners.set(`branchLast:${eventName}`, listener),
    },
    branchResults: {
      addEventListener: (eventName, listener) => listeners.set(`branchResults:${eventName}`, listener),
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
  listeners.get('branchResults:click')({
    target: {
      closest: (selector) => selector === '[data-preview-branch]'
        ? { dataset: { previewBranch: 'branch-1' } }
        : undefined,
    },
  });

  assert.equal(getActiveSession(state).activeBranchId, 'branch-1');
  assert.equal(elements.providerStatus.textContent, 'Previewing branch: Short option.');
  assert.deepEqual(calls, ['save', 'render']);

  listeners.get('branchResults:click')({
    target: {
      closest: (selector) => selector === '[data-promote-branch]'
        ? { dataset: { promoteBranch: 'branch-1' } }
        : undefined,
    },
  });

  assert.deepEqual(getActiveSession(state).messages.map((message) => message.id), ['user-1', 'assistant-branch']);
  assert.equal(getActiveSession(state).activeBranchId, undefined);
  assert.equal(elements.providerStatus.textContent, 'Branch saved as the main timeline.');
  assert.deepEqual(calls, ['save', 'render', 'save', 'render']);
});
