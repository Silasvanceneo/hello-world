export async function configureServiceWorker({ navigatorRef = globalThis.navigator, locationRef = globalThis.location } = {}) {
  if (!navigatorRef || !('serviceWorker' in navigatorRef)) {
    return 'unsupported';
  }

  const protocol = locationRef?.protocol ?? '';
  const isDesktopShell = Boolean(globalThis.__TAURI__);
  if (isDesktopShell || !['http:', 'https:'].includes(protocol)) {
    await unregisterServiceWorkers(navigatorRef);
    await clearPwaCaches();
    return 'disabled';
  }

  await navigatorRef.serviceWorker.register('./sw.js');
  return 'registered';
}

async function unregisterServiceWorkers(navigatorRef) {
  const registrations = await navigatorRef.serviceWorker.getRegistrations?.();
  await Promise.all((registrations ?? []).map((registration) => registration.unregister()));
}

async function clearPwaCaches() {
  if (!globalThis.caches?.keys) {
    return;
  }
  const keys = await globalThis.caches.keys();
  await Promise.all(keys.filter((key) => key.startsWith('hello-world-pwa-')).map((key) => globalThis.caches.delete(key)));
}
