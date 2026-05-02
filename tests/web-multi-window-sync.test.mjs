import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bindMultiWindowSync,
  shouldAcceptIncomingState,
  writeStateAcrossWindows,
} from '../apps/web/src/multi-window-sync.js';
import {
  addSession,
  createInitialWebState,
  createSession,
  markWebStateUpdated,
  parseState,
  serializeState,
} from '../apps/web/src/web-state.js';

const STORAGE_KEY = 'hello-world:web-state:v1';

test('web multi-window sync accepts a newer storage state and rerenders', () => {
  const listeners = new Map();
  const calls = [];
  let state = createInitialWebState('2026-05-02T04:00:00.000Z');
  const incoming = addSession(state, createSession('session-2', '2026-05-02T04:05:00.000Z'));

  bindMultiWindowSync({
    storageKey: STORAGE_KEY,
    environment: createEnvironment(listeners),
    getState: () => state,
    setState: (nextState) => { state = nextState; },
    parseState,
    render: () => calls.push('render'),
    onStatus: (message) => calls.push(message),
  });

  listeners.get('storage')({ key: STORAGE_KEY, newValue: serializeState(incoming) });

  assert.equal(state.activeSessionId, 'session-2');
  assert.deepEqual(calls, ['render', 'Updated from another window.']);
});

test('web multi-window sync ignores stale, unrelated, and invalid storage events', () => {
  const listeners = new Map();
  const calls = [];
  let state = markWebStateUpdated(
    addSession(createInitialWebState('2026-05-02T04:00:00.000Z'), createSession('session-new', '2026-05-02T04:10:00.000Z')),
    '2026-05-02T04:10:00.000Z',
  );
  const stale = createInitialWebState('2026-05-02T04:00:00.000Z');

  bindMultiWindowSync({
    storageKey: STORAGE_KEY,
    environment: createEnvironment(listeners),
    getState: () => state,
    setState: (nextState) => { state = nextState; },
    parseState,
    render: () => calls.push('render'),
    onStatus: (message) => calls.push(message),
  });

  listeners.get('storage')({ key: 'other:key', newValue: serializeState(stale) });
  listeners.get('storage')({ key: STORAGE_KEY, newValue: '{bad json' });
  listeners.get('storage')({ key: STORAGE_KEY, newValue: serializeState(stale) });

  assert.equal(state.activeSessionId, 'session-new');
  assert.deepEqual(calls, []);
});

test('web multi-window sync can unsubscribe from storage events', () => {
  const listeners = new Map();
  let state = createInitialWebState('2026-05-02T04:00:00.000Z');
  const unbind = bindMultiWindowSync({
    storageKey: STORAGE_KEY,
    environment: createEnvironment(listeners),
    getState: () => state,
    setState: (nextState) => { state = nextState; },
    parseState,
    render: () => undefined,
  });

  unbind();

  assert.equal(listeners.has('storage'), false);
});

test('web multi-window write guard adopts newer stored state instead of overwriting it', () => {
  const stale = createInitialWebState('2026-05-02T04:00:00.000Z');
  const stored = markWebStateUpdated(
    addSession(createInitialWebState('2026-05-02T04:00:00.000Z'), createSession('session-stored', '2026-05-02T04:12:00.000Z')),
    '2026-05-02T04:12:00.000Z',
  );
  const storage = createStorage({ [STORAGE_KEY]: serializeState(stored) });

  const result = writeStateAcrossWindows({
    storageKey: STORAGE_KEY,
    storage,
    state: stale,
    parseState,
    serializeState,
    markStateUpdated: markWebStateUpdated,
    now: () => '2026-05-02T04:20:00.000Z',
  });

  assert.equal(result.action, 'accepted-existing');
  assert.equal(result.state.activeSessionId, 'session-stored');
  assert.equal(parseState(storage.getItem(STORAGE_KEY)).activeSessionId, 'session-stored');
});

test('web multi-window write guard stamps and saves current state when it is fresh', () => {
  const state = addSession(createInitialWebState('2026-05-02T04:00:00.000Z'), createSession('session-current', '2026-05-02T04:15:00.000Z'));
  const storage = createStorage({
    [STORAGE_KEY]: serializeState(createInitialWebState('2026-05-02T04:00:00.000Z')),
  });

  const result = writeStateAcrossWindows({
    storageKey: STORAGE_KEY,
    storage,
    state,
    parseState,
    serializeState,
    markStateUpdated: markWebStateUpdated,
    now: () => '2026-05-02T04:20:00.000Z',
  });

  const saved = parseState(storage.getItem(STORAGE_KEY));
  assert.equal(result.action, 'saved');
  assert.equal(result.state.updatedAt, '2026-05-02T04:20:00.000Z');
  assert.equal(saved.activeSessionId, 'session-current');
  assert.equal(saved.updatedAt, '2026-05-02T04:20:00.000Z');
});

test('web multi-window freshness comparison rejects equal-revision state', () => {
  const state = createInitialWebState('2026-05-02T04:00:00.000Z');
  assert.equal(shouldAcceptIncomingState(state, { ...state, activeSessionId: 'other-session' }), false);
});

test('web multi-window freshness comparison uses a stable tie-breaker for equal timestamps', () => {
  const state = createInitialWebState('2026-05-02T04:00:00.000Z');
  const incoming = { ...state, activeSessionId: 'zzzz-session' };

  assert.equal(shouldAcceptIncomingState(state, incoming), true);
  assert.equal(shouldAcceptIncomingState(incoming, state), false);
});

function createEnvironment(listeners) {
  return {
    addEventListener: (eventName, listener) => listeners.set(eventName, listener),
    removeEventListener: (eventName, listener) => {
      if (listeners.get(eventName) === listener) {
        listeners.delete(eventName);
      }
    },
  };
}

function createStorage(initial = {}) {
  const entries = new Map(Object.entries(initial));
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, String(value)),
  };
}
