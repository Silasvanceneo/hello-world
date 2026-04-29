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

## Mobile

- `apps/mobile/capacitor.config.ts`
- `apps/mobile/android/.gitkeep`
- `apps/mobile/ios/.gitkeep`

The current mobile files are a Capacitor configuration scaffold. A real Android debug APK requires Capacitor packages plus Android SDK/Gradle.
