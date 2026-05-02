import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bindDesktopCaptureRequests,
  canUseTauriInvoke,
  createDesktopProviderFetch,
  detectLocalOllama,
  deleteDesktopProviderSecret,
  readDesktopProviderSecret,
  summarizeDesktopNativeCapabilities,
  readDesktopNativeCapabilities,
  saveDesktopProviderSecret,
} from '../apps/web/src/native-desktop.js';

test('native desktop helpers detect Tauri invoke availability', () => {
  assert.equal(canUseTauriInvoke({ __TAURI__: { core: { invoke() {} } } }), true);
  assert.equal(canUseTauriInvoke({ __TAURI__: { core: {} } }), false);
  assert.equal(canUseTauriInvoke({}), false);
});

test('readDesktopNativeCapabilities invokes the desktop command', async () => {
  const capabilities = await readDesktopNativeCapabilities({
    invoke: async (command) => {
      assert.equal(command, 'desktop_native_capabilities');
      return { screen_capture: true, local_ollama_detection: true };
    },
  });

  assert.equal(capabilities.screen_capture, true);
  assert.equal(capabilities.local_ollama_detection, true);
});

test('detectLocalOllama invokes the desktop Ollama probe command', async () => {
  const status = await detectLocalOllama({
    invoke: async (command) => {
      assert.equal(command, 'detect_local_ollama');
      return { url: 'http://127.0.0.1:11434', reachable: false, message: 'not reachable' };
    },
  });

  assert.equal(status.url, 'http://127.0.0.1:11434');
  assert.equal(status.reachable, false);
});

test('desktop capability summary reports native OS integrations when available', () => {
  const summary = summarizeDesktopNativeCapabilities({
    screen_capture: true,
    clipboard_image: true,
    global_shortcut: true,
    tray: true,
    keychain: true,
    local_ollama_detection: true,
    sandboxed_code_execution: true,
    provider_fetch_proxy: true,
  });

  assert.equal(summary.ready.length, 8);
  assert.equal(summary.deferred.length, 0);
  assert.match(summary.message, /8 available/);
  assert(summary.ready.some((item) => item.id === 'keychain' && /OS keychain/.test(item.reason)));
  assert(summary.ready.some((item) => item.id === 'provider_fetch_proxy' && /browser CORS/.test(item.reason)));
});

test('desktop keychain helpers invoke native commands without exposing secrets in command names', async () => {
  const calls = [];
  const invoke = async (command, payload) => {
    calls.push({ command, payload });
    if (command === 'read_desktop_provider_secret') {
      return { found: true, value: 'runtime-secret' };
    }
    return { ok: true };
  };

  await saveDesktopProviderSecret({ providerId: 'p1', secret: 'runtime-secret', invoke });
  const read = await readDesktopProviderSecret({ providerId: 'p1', invoke });
  await deleteDesktopProviderSecret({ providerId: 'p1', invoke });

  assert.deepEqual(calls.map((call) => call.command), [
    'save_desktop_provider_secret',
    'read_desktop_provider_secret',
    'delete_desktop_provider_secret',
  ]);
  assert.equal(calls[0].payload.providerId, 'p1');
  assert.equal(calls[0].payload.secret, 'runtime-secret');
  assert.equal(read.value, 'runtime-secret');
});

test('desktop provider fetch helper wraps Tauri response as a Fetch Response', async () => {
  const calls = [];
  const fetch = createDesktopProviderFetch({
    invoke: async (command, payload) => {
      calls.push({ command, payload });
      return {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        body: '{"data":[{"id":"gpt-test"}]}',
      };
    },
  });

  const response = await fetch('https://api.example.test/v1/models', {
    method: 'GET',
    headers: { authorization: 'Bearer runtime-secret' },
  });

  assert.equal(response.ok, true);
  assert.deepEqual(await response.json(), { data: [{ id: 'gpt-test' }] });
  assert.equal(calls[0].command, 'desktop_provider_fetch');
  assert.equal(calls[0].payload.request.url, 'https://api.example.test/v1/models');
  assert.equal(calls[0].payload.request.headers.authorization, 'Bearer runtime-secret');
});

test('desktop capture request binding listens through Tauri events', async () => {
  const seen = [];
  const unlistenCalls = [];
  const unbind = await bindDesktopCaptureRequests({
    listen: async (eventName, callback) => {
      assert.equal(eventName, 'desktop://capture-screen-requested');
      callback({ payload: { source: 'tray' } });
      return () => unlistenCalls.push('unlisten');
    },
    onCaptureRequest: (payload) => seen.push(payload),
  });

  unbind();

  assert.deepEqual(seen, [{ source: 'tray' }]);
  assert.deepEqual(unlistenCalls, ['unlisten']);
});
