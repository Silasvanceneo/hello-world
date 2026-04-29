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
