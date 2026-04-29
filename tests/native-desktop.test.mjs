import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canUseTauriInvoke,
  detectLocalOllama,
  readDesktopNativeCapabilities,
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
