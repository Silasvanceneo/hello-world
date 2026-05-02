export function canUseTauriInvoke(environment = globalThis) {
  return Boolean(environment.__TAURI__?.core?.invoke);
}

export async function readDesktopNativeCapabilities({
  environment = globalThis,
  invoke = environment.__TAURI__?.core?.invoke,
} = {}) {
  if (!invoke) {
    throw new Error('Tauri invoke is not available in this runtime.');
  }
  return invoke('desktop_native_capabilities');
}

export async function detectLocalOllama({
  environment = globalThis,
  invoke = environment.__TAURI__?.core?.invoke,
} = {}) {
  if (!invoke) {
    throw new Error('Desktop native Ollama detection is only available inside the Tauri app.');
  }
  return invoke('detect_local_ollama');
}

export async function saveDesktopProviderSecret({
  providerId,
  secret,
  environment = globalThis,
  invoke = environment.__TAURI__?.core?.invoke,
} = {}) {
  if (!invoke) {
    throw new Error('Desktop keychain storage is only available inside the Tauri app.');
  }
  return invoke('save_desktop_provider_secret', { providerId, secret });
}

export async function readDesktopProviderSecret({
  providerId,
  environment = globalThis,
  invoke = environment.__TAURI__?.core?.invoke,
} = {}) {
  if (!invoke) {
    throw new Error('Desktop keychain storage is only available inside the Tauri app.');
  }
  return invoke('read_desktop_provider_secret', { providerId });
}

export async function deleteDesktopProviderSecret({
  providerId,
  environment = globalThis,
  invoke = environment.__TAURI__?.core?.invoke,
} = {}) {
  if (!invoke) {
    throw new Error('Desktop keychain storage is only available inside the Tauri app.');
  }
  return invoke('delete_desktop_provider_secret', { providerId });
}

export function canUseDesktopCodeExecution(environment = globalThis) {
  return Boolean(environment.__TAURI__?.core?.invoke);
}

export async function executeDesktopCode({
  request,
  confirmation,
  environment = globalThis,
  invoke = environment.__TAURI__?.core?.invoke,
} = {}) {
  if (!invoke) {
    throw new Error('Desktop code execution is only available inside the Tauri app.');
  }
  return invoke('run_sandboxed_code', { request, confirmation });
}

export async function bindDesktopCaptureRequests({
  environment = globalThis,
  listen = environment.__TAURI__?.event?.listen,
  onCaptureRequest,
} = {}) {
  if (!listen || typeof onCaptureRequest !== 'function') {
    return () => undefined;
  }
  const unlisten = await listen('desktop://capture-screen-requested', (event) => {
    onCaptureRequest(event?.payload ?? {});
  });
  return typeof unlisten === 'function' ? unlisten : () => undefined;
}

export function summarizeDesktopNativeCapabilities(capabilities = {}) {
  const items = [
    {
      id: 'screen_capture',
      label: 'Screenshot capture',
      available: capabilities.screen_capture === true,
      reason: 'Uses the shared Web capture flow.',
    },
    {
      id: 'clipboard_image',
      label: 'Clipboard image input',
      available: capabilities.clipboard_image === true,
      reason: 'Uses the shared Web clipboard image flow.',
    },
    {
      id: 'local_ollama_detection',
      label: 'Local Ollama detection',
      available: capabilities.local_ollama_detection === true,
      reason: 'Uses the Tauri local port probe.',
    },
    {
      id: 'global_shortcut',
      label: 'Global shortcut',
      available: capabilities.global_shortcut === true,
      reason: capabilities.global_shortcut === true
        ? 'Ctrl+Shift+H requests the shared screenshot capture flow.'
        : 'Unavailable when the OS rejects the Ctrl+Shift+H registration.',
    },
    {
      id: 'tray',
      label: 'System tray',
      available: capabilities.tray === true,
      reason: capabilities.tray === true
        ? 'Provides show, capture, and quit actions from the desktop tray.'
        : 'Unavailable when the desktop tray cannot be initialized.',
    },
    {
      id: 'keychain',
      label: 'Desktop keychain',
      available: capabilities.keychain === true,
      reason: capabilities.keychain === true
        ? 'Stores provider secrets in the OS keychain through Tauri commands.'
        : 'Provider API keys remain runtime-only when the OS keychain is unavailable.',
    },
    {
      id: 'sandboxed_code_execution',
      label: 'Sandboxed code execution',
      available: capabilities.sandboxed_code_execution === true,
      reason: capabilities.sandboxed_code_execution === true
        ? 'Runs supported snippets through controlled Desktop runner commands after confirmation.'
        : 'Code execution stays hidden outside the Desktop sandbox runner.',
    },
  ];
  const ready = items.filter((item) => item.available);
  const deferred = items.filter((item) => !item.available);
  return {
    ready,
    deferred,
    message: `${ready.length} available, ${deferred.length} deferred desktop integrations.`,
  };
}
