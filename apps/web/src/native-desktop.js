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
      reason: 'Deferred until a Tauri global shortcut plugin and permission UI are added.',
    },
    {
      id: 'tray',
      label: 'System tray',
      available: capabilities.tray === true,
      reason: 'Deferred until tray lifecycle behavior is implemented in the desktop shell.',
    },
    {
      id: 'keychain',
      label: 'Desktop keychain',
      available: capabilities.keychain === true,
      reason: 'Deferred; provider API keys remain runtime-only until OS keychain storage is added.',
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
