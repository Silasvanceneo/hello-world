# Three-terminal Shells

P0-M6 establishes offline-checkable shell configuration for Web/PWA, Desktop, and Mobile.

## Web/PWA

- `apps/web/index.html`
- `apps/web/static/manifest.webmanifest`
- `apps/web/static/sw.js`
- `apps/web/src/pwa.ts`

## Desktop

- `apps/desktop/src-tauri/tauri.conf.json`
- `apps/desktop/src-tauri/Cargo.toml`
- `apps/desktop/src-tauri/src/main.rs`

The current desktop files are a Tauri configuration scaffold. A real Windows build requires Tauri CLI/Rust toolchain integration.
The P1 native input pass upgrades the shell with Tauri commands for capability reporting and local Ollama port detection.

## Mobile

- `apps/mobile/capacitor.config.ts`
- `apps/mobile/android/gradlew.bat`
- `apps/mobile/android/app/src/main/AndroidManifest.xml`
- `apps/mobile/ios/.gitkeep`

The Android project is initialized and can sync the shared Web build through Capacitor. A real Android debug APK still requires JDK, Android SDK, and ADB/device tooling.
