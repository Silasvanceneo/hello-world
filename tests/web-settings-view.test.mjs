import assert from 'node:assert/strict';
import test from 'node:test';
import { bindSettingsView, setActiveView } from '../apps/web/src/settings-view.js';

test('settings view switches between chat and settings without browser history', () => {
  const calls = [];
  const listeners = new Map();
  const root = { dataset: { view: 'chat' } };
  const settingsTrigger = {
    addEventListener: (eventName, listener) => listeners.set(`settings:${eventName}`, listener),
  };
  const chatTrigger = {
    addEventListener: (eventName, listener) => listeners.set(`chat:${eventName}`, listener),
  };

  bindSettingsView({
    root,
    settingsTriggers: [settingsTrigger],
    chatTriggers: [chatTrigger],
    focusTarget: { focus: () => calls.push('focus') },
    scrollTarget: { scrollIntoView: (options) => calls.push(['scroll', options.block]) },
  });

  listeners.get('settings:click')({ preventDefault: () => calls.push('prevent-settings') });
  listeners.get('chat:click')({ preventDefault: () => calls.push('prevent-chat') });

  assert.equal(root.dataset.view, 'chat');
  assert.deepEqual(calls, [
    'prevent-settings',
    'prevent-chat',
    ['scroll', 'nearest'],
    'focus',
  ]);
});

test('setActiveView normalizes unknown views to chat', () => {
  const root = { dataset: {} };

  assert.equal(setActiveView({ root, view: 'settings' }), 'settings');
  assert.equal(root.dataset.view, 'settings');
  assert.equal(setActiveView({ root, view: 'other' }), 'chat');
  assert.equal(root.dataset.view, 'chat');
});

test('settings view honors a direct settings hash on startup', () => {
  const root = { dataset: { view: 'chat' } };

  bindSettingsView({ root, initialHash: '#settings' });

  assert.equal(root.dataset.view, 'settings');
});
