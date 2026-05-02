import assert from 'node:assert/strict';
import test from 'node:test';
import { configureServiceWorker } from '../apps/web/src/pwa-runtime.js';

test('pwa runtime registers service worker for web origins', async () => {
  const calls = [];
  const navigatorRef = {
    serviceWorker: {
      register: async (path) => {
        calls.push(path);
      },
    },
  };

  const result = await configureServiceWorker({
    navigatorRef,
    locationRef: { protocol: 'https:' },
  });

  assert.equal(result, 'registered');
  assert.deepEqual(calls, ['./sw.js']);
});

test('pwa runtime disables service worker and clears old caches in desktop shell', async () => {
  const registrations = [{ unregister: async () => 'ok' }];
  const deleted = [];
  const previousTauri = globalThis.__TAURI__;
  const previousCaches = globalThis.caches;
  globalThis.__TAURI__ = { core: {} };
  globalThis.caches = {
    keys: async () => ['hello-world-pwa-v1', 'other-cache'],
    delete: async (key) => {
      deleted.push(key);
      return true;
    },
  };

  try {
    const result = await configureServiceWorker({
      navigatorRef: {
        serviceWorker: {
          getRegistrations: async () => registrations,
        },
      },
      locationRef: { protocol: 'tauri:' },
    });

    assert.equal(result, 'disabled');
    assert.deepEqual(deleted, ['hello-world-pwa-v1']);
  } finally {
    if (previousTauri === undefined) {
      delete globalThis.__TAURI__;
    } else {
      globalThis.__TAURI__ = previousTauri;
    }
    if (previousCaches === undefined) {
      delete globalThis.caches;
    } else {
      globalThis.caches = previousCaches;
    }
  }
});
