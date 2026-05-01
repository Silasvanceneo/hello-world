# Native Inputs

P1-M4/P1-M5 add the first real native input foundations while keeping Web as the shared UI surface.

## Desktop

- Screenshot input is exposed through `apps/web/src/native-media.js` using the WebView/browser `getDisplayMedia()` API.
- Clipboard image input is exposed through the Clipboard API and converted into `ChatFileAttachment` image data URLs.
- `apps/desktop/src-tauri/src/main.rs` registers two Tauri commands:
  - `desktop_native_capabilities`
  - `detect_local_ollama`
- `apps/web/src/native-desktop.js` calls Tauri through `window.__TAURI__.core.invoke` when running inside the desktop shell.
- `summarizeDesktopNativeCapabilities()` reports available desktop integrations separately from deferred OS integrations so the UI and docs do not imply tray, global shortcut, or keychain support before those plugins are added.

Not complete yet:

- Global shortcut registration. This still needs a Tauri global shortcut plugin plus permission/enablement UI.
- System tray integration. This still needs tray lifecycle handling in the desktop shell.
- Desktop keychain-backed API key storage. Provider API keys remain runtime-only until OS keychain storage is implemented.

## Mobile

- Capacitor Android is initialized under `apps/mobile/android`.
- `@capacitor/camera` captures photos as data URLs for image question workflows.
- `@capacitor/share` provides a foundation for "share to hello-world" flows.
- `@aparajita/capacitor-secure-storage` provides native secure storage. On Android it uses Android KeyStore-backed encryption for values stored in SharedPreferences; the web fallback must not be treated as production-secret storage.
- Voice input and speech playback are exposed from the shared Web UI through `apps/web/src/native-voice.js`.
  - `Voice` uses the browser/WebView Speech Recognition API when available.
  - `Speak last` uses the browser/WebView Speech Synthesis API to read the latest assistant reply.
  - Unsupported runtimes return user-readable status messages instead of silently failing.

Not complete yet:

- A full Android emulator/device launch smoke test. The APK builds, but this workstation currently has no online ADB device or AVD, and the Android emulator/system-image package could not be resolved from the SDK repository during this checkpoint.

## Toolchain status

Current project verification can run without Android Studio, but native package verification still depends on local platform tooling:

- Desktop: Rust/Cargo and Tauri build dependencies.
- Android: JDK, Android SDK, emulator or device/ADB.
