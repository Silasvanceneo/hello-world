import assert from 'node:assert/strict';
import test from 'node:test';
import { bindComposerDraftActions, prepareComposerDraft } from '../apps/web/src/composer-drafts.js';

test('web composer drafts update state, persist, render, focus, and report status', () => {
  const calls = [];
  let state = { id: 'state-1' };
  const elements = {
    prompt: {
      value: '',
      focus: () => calls.push('focus'),
    },
    providerStatus: {
      textContent: '',
    },
  };

  prepareComposerDraft({
    elements,
    producer: () => ({ state: { id: 'state-2' }, draftText: 'Retry this' }),
    setState: (nextState) => { state = nextState; },
    saveState: () => calls.push('save'),
    render: () => calls.push('render'),
    statusMessage: 'Draft ready.',
  });

  assert.deepEqual(state, { id: 'state-2' });
  assert.equal(elements.prompt.value, 'Retry this');
  assert.equal(elements.providerStatus.textContent, 'Draft ready.');
  assert.deepEqual(calls, ['save', 'render', 'focus']);
});

test('web composer drafts surface producer errors without mutating composer text', () => {
  const calls = [];
  const elements = {
    prompt: {
      value: 'Keep me',
      focus: () => calls.push('focus'),
    },
    providerStatus: {
      textContent: '',
    },
  };

  prepareComposerDraft({
    elements,
    producer: () => { throw new Error('No draft available.'); },
    setState: () => calls.push('setState'),
    saveState: () => calls.push('save'),
    render: () => calls.push('render'),
    statusMessage: 'Draft ready.',
  });

  assert.equal(elements.prompt.value, 'Keep me');
  assert.equal(elements.providerStatus.textContent, 'No draft available.');
  assert.deepEqual(calls, []);
});

test('web composer draft binding wires message-list edit and retry callbacks', () => {
  const calls = [];
  const binding = bindComposerDraftActions({
    elements: {
      prompt: {
        value: '',
        focus: () => calls.push('focus'),
      },
      providerStatus: {
        textContent: '',
      },
    },
    getState: () => ({ id: 'state-1' }),
    setState: (nextState) => calls.push(['setState', nextState.id]),
    saveState: () => calls.push('save'),
    render: () => calls.push('render'),
    prepareEditDraft: (_state, messageId) => ({ state: { id: `edit-${messageId}` }, draftText: 'Edit text' }),
    prepareRetryDraft: () => ({ state: { id: 'retry-state' }, draftText: 'Retry text' }),
  });

  binding.editMessage('user-1');
  binding.retryLastAssistant();

  assert.deepEqual(calls, [
    ['setState', 'edit-user-1'],
    'save',
    'render',
    'focus',
    ['setState', 'retry-state'],
    'save',
    'render',
    'focus',
  ]);
});
