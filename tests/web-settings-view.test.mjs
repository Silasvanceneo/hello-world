import assert from 'node:assert/strict';
import test from 'node:test';
import { bindSettingsView, setActiveView } from '../apps/web/src/settings-view.js';

test('settings view switches between chat and settings without browser history', () => {
  const calls = [];
  const listeners = new Map();
  const root = { dataset: { view: 'chat' } };
  const scrollContainer = {
    scrollLeft: 4,
    scrollTop: 72,
    scrollTo: (position) => calls.push(['restore-scroll', position.left, position.top]),
  };
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
    scrollContainer,
    scrollTarget: { scrollIntoView: (options) => calls.push(['scroll', options.block]) },
  });

  scrollContainer.scrollTop = 128;
  listeners.get('settings:click')({ preventDefault: () => calls.push('prevent-settings') });
  scrollContainer.scrollTop = 8;
  listeners.get('chat:click')({ preventDefault: () => calls.push('prevent-chat') });

  assert.equal(root.dataset.view, 'chat');
  assert.deepEqual(calls, [
    'prevent-settings',
    'prevent-chat',
    ['scroll', 'nearest'],
    'focus',
    ['restore-scroll', 4, 128],
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

test('settings view honors direct settings section hashes on startup', () => {
  const root = { dataset: { view: 'chat' } };

  bindSettingsView({ root, initialHash: '#settings-provider' });

  assert.equal(root.dataset.view, 'settings');
});

test('settings view can restore scroll position without scrollTo', () => {
  const listeners = new Map();
  const root = { dataset: { view: 'chat' } };
  const scrollContainer = { scrollLeft: 2, scrollTop: 10 };

  bindSettingsView({
    root,
    settingsTriggers: [{ addEventListener: (eventName, listener) => listeners.set(`settings:${eventName}`, listener) }],
    chatTriggers: [{ addEventListener: (eventName, listener) => listeners.set(`chat:${eventName}`, listener) }],
    scrollContainer,
  });

  scrollContainer.scrollTop = 44;
  listeners.get('settings:click')({ preventDefault: () => undefined });
  scrollContainer.scrollTop = 0;
  scrollContainer.scrollLeft = 0;
  listeners.get('chat:click')({ preventDefault: () => undefined });

  assert.equal(scrollContainer.scrollLeft, 2);
  assert.equal(scrollContainer.scrollTop, 44);
});
