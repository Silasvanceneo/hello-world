# Native Inputs

P1-M4/P1-M5 add the first real native input foundations while keeping Web as the shared UI surface.

## Desktop

- Screenshot input is exposed through `apps/web/src/native-media.js` using the WebView/browser `getDisplayMedia()` API.
- Clipboard image input is exposed through the Clipboard API and converted into `ChatFileAttachment` image data URLs.
- `apps/desktop/src-tauri/src/main.rs` registers native desktop commands:
  - `desktop_native_capabilities`
  - `detect_local_ollama`
  - `save_desktop_provider_secret`
  - `read_desktop_provider_secret`
  - `delete_desktop_provider_secret`
  - `run_sandboxed_code`
- `apps/web/src/native-desktop.js` calls Tauri through `window.__TAURI__.core.invoke` when running inside the desktop shell.
- `summarizeDesktopNativeCapabilities()` reports screen capture, clipboard image input, local Ollama detection, global shortcut, tray, and keychain availability separately.
- The desktop shell creates a system tray with Show, Capture screen, and Quit actions.
- `Ctrl+Shift+H` registers as the desktop capture shortcut when the OS accepts the hotkey. The shortcut and tray capture action emit `desktop://capture-screen-requested`; the Web runtime listens for that event and reuses the shared screenshot attachment flow.
- Provider secrets can be stored, read, and deleted through Windows Credential Manager. Web local state still stores only provider metadata and `apiKeyRef`; the secret value is not serialized into localStorage or backup archives.
- Sandboxed code execution is Desktop-only. The command accepts only supported language snippets, runs from a temporary work directory, clears inherited environment, applies timeout/output limits, and is hidden on Web/Mobile.

## Mobile

- Capacitor Android is initialized under `apps/mobile/android`.
- `@capacitor/camera` captures photos as data URLs for image question workflows.
- `@capacitor/share` provides a foundation for "share to hello-world" flows.
- `@aparajita/capacitor-secure-storage` provides native secure storage. On Android it uses Android KeyStore-backed encryption for values stored in SharedPreferences; the web fallback must not be treated as production-secret storage.
- Voice input and speech playback are exposed from the shared Web UI through `apps/web/src/native-voice.js`.
  - `Voice` uses the browser/WebView Speech Recognition API when available.
  - `Speak last` uses the browser/WebView Speech Synthesis API to read the latest assistant reply.
  - Unsupported runtimes return user-readable status messages instead of silently failing.

- Android launch smoke passed on `hello_world_api36`: the APK installed, `com.helloworld.ai/.MainActivity` launched, and ADB reported the app process.

## Toolchain status

Current project verification can run without Android Studio, but native package verification still depends on local platform tooling:

- Desktop: Rust/Cargo and Tauri build dependencies.
- Android: JDK, Android SDK, emulator or device/ADB.
