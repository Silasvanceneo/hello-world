# Native Inputs

P1-M4/P1-M5 add the first real native input foundations while keeping Web as the shared UI surface.

## Desktop

- Screenshot input is exposed through `apps/web/src/native-media.js` using the WebView/browser `getDisplayMedia()` API.
- Clipboard image input is exposed through the Clipboard API and converted into `ChatFileAttachment` image data URLs.
- `apps/desktop/src-tauri/src/main.rs` registers two Tauri commands:
  - `desktop_native_capabilities`
  - `detect_local_ollama`
- `apps/web/src/native-desktop.js` calls Tauri through `window.__TAURI__.core.invoke` when running inside the desktop shell.

Not complete yet:

- Global shortcut registration.
- System tray integration.
- Desktop keychain-backed API key storage.

## Mobile

- Capacitor Android is initialized under `apps/mobile/android`.
- `@capacitor/camera` captures photos as data URLs for image question workflows.
- `@capacitor/share` provides a foundation for "share to hello-world" flows.
- `@aparajita/capacitor-secure-storage` provides native secure storage. On Android it uses Android KeyStore-backed encryption for values stored in SharedPreferences; the web fallback must not be treated as production-secret storage.

Not complete yet:

- Voice input.
- Text-to-speech playback.
- A full Android debug APK verification on this machine.

## Toolchain status

Current project verification can run without Android Studio, but native package verification still depends on local platform tooling:

- Desktop: Rust/Cargo and Tauri build dependencies.
- Android: JDK, Android SDK, emulator or device/ADB.
