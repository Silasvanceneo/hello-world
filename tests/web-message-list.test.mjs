import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bindMessageListWindow,
  createMessageListViewModel,
  renderMessageList,
} from '../apps/web/src/message-list.js';
import { createSession, createTextMessage } from '../apps/web/src/web-state.js';

test('web message list windows long chats to the latest messages', () => {
  const session = {
    ...createSession('session-long', '2026-05-02T03:00:00.000Z'),
    messages: Array.from({ length: 12 }, (_, index) => createTextMessage(
      index % 2 === 0 ? 'user' : 'assistant',
      `Message ${index + 1}`,
      '2026-05-02T03:00:00.000Z',
      `message-${index + 1}`,
    )),
  };

  const view = createMessageListViewModel(session, { windowSize: 5 });

  assert.equal(view.totalMessages, 12);
  assert.equal(view.hiddenBefore, 7);
  assert.equal(view.visibleMessages.length, 5);
  assert.equal(view.visibleMessages[0]?.id, 'message-8');
  assert.equal(view.isWindowed, true);
});

test('web message list can expand a long chat to all messages', () => {
  const session = {
    ...createSession('session-expanded', '2026-05-02T03:00:00.000Z'),
    messages: Array.from({ length: 6 }, (_, index) => createTextMessage(
      'assistant',
      `Message ${index + 1}`,
      '2026-05-02T03:00:00.000Z',
      `message-${index + 1}`,
    )),
  };

  const view = createMessageListViewModel(session, { expanded: true, windowSize: 3 });

  assert.equal(view.hiddenBefore, 0);
  assert.equal(view.visibleMessages.length, 6);
  assert.equal(view.isWindowed, false);
});

test('web message list renders empty state and escapes message text', () => {
  const emptyHtml = renderMessageList(createSession('empty', '2026-05-02T03:00:00.000Z'));
  const session = {
    ...createSession('unsafe', '2026-05-02T03:00:00.000Z'),
    messages: [
      createTextMessage('user', '<script>alert(1)</script>', '2026-05-02T03:00:00.000Z', 'unsafe-message'),
    ],
  };
  const messageHtml = renderMessageList(session);

  assert.match(emptyHtml, /empty-state/);
  assert.equal(messageHtml.includes('<script>alert(1)</script>'), false);
  assert.match(messageHtml, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('web message list renders edit and retry controls for eligible messages', () => {
  const session = {
    ...createSession('session-actions', '2026-05-02T03:00:00.000Z'),
    messages: [
      createTextMessage('user', 'Draft <unsafe>', '2026-05-02T03:01:00.000Z', 'user-"quoted"'),
      createTextMessage('assistant', 'Answer', '2026-05-02T03:02:00.000Z', 'assistant-1'),
    ],
  };

  const html = renderMessageList(session);

  assert.match(html, /data-edit-message="user-&quot;quoted&quot;"/);
  assert.match(html, /data-retry-last="assistant-1"/);
  assert.equal(html.includes('Draft <unsafe>'), false);
});

test('web message list renders an expand control for hidden earlier messages', () => {
  const session = {
    ...createSession('session-"quoted"', '2026-05-02T03:00:00.000Z'),
    messages: Array.from({ length: 4 }, (_, index) => createTextMessage(
      'assistant',
      `Message ${index + 1}`,
      '2026-05-02T03:00:00.000Z',
      `message-${index + 1}`,
    )),
  };

  const html = renderMessageList(session, { windowSize: 2 });

  assert.equal(html.includes('Message 1'), false);
  assert.match(html, /Show 2 earlier messages/);
  assert.match(html, /data-expand-messages="session-&quot;quoted&quot;"/);
});

test('web message list binding expands the active session window', () => {
  const listeners = new Map();
  const calls = [];
  const session = createSession('session-1', '2026-05-02T03:00:00.000Z');
  const elements = {
    messages: {
      addEventListener: (eventName, listener) => listeners.set(eventName, listener),
    },
  };

  bindMessageListWindow({
    elements,
    getSession: () => session,
    expandSession: (sessionId) => calls.push(['expand', sessionId]),
    render: () => calls.push(['render']),
  });
  listeners.get('click')({
    target: {
      closest: () => ({ dataset: { expandMessages: 'session-1' } }),
    },
  });

  assert.deepEqual(calls, [
    ['expand', 'session-1'],
    ['render'],
  ]);
});

test('web message list binding routes edit and retry actions', () => {
  const listeners = new Map();
  const calls = [];
  const session = createSession('session-1', '2026-05-02T03:00:00.000Z');
  const elements = {
    messages: {
      addEventListener: (eventName, listener) => listeners.set(eventName, listener),
    },
  };

  bindMessageListWindow({
    elements,
    getSession: () => session,
    expandSession: (sessionId) => calls.push(['expand', sessionId]),
    editMessage: (messageId) => calls.push(['edit', messageId]),
    retryLastAssistant: () => calls.push(['retry']),
    render: () => calls.push(['render']),
  });
  listeners.get('click')({
    target: {
      closest: (selector) => selector === '[data-edit-message]'
        ? { dataset: { editMessage: 'user-1' } }
        : undefined,
    },
  });
  listeners.get('click')({
    target: {
      closest: (selector) => selector === '[data-retry-last]'
        ? { dataset: { retryLast: 'assistant-1' } }
        : undefined,
    },
  });

  assert.deepEqual(calls, [
    ['edit', 'user-1'],
    ['retry'],
  ]);
});
