# Deployment

## Web

`npm run build:web` creates the static PWA bundle under `apps/web/build`. It includes the shared Web UI, PWA manifest, service worker, provider/runtime modules, and static assets.

## Desktop

`npm run build:desktop` builds the Windows Tauri executable at `apps/desktop/src-tauri/target/release/hello-world-desktop.exe`.

The current release publishes the executable directly. Installer packaging and code signing remain separate distribution work.

## Mobile

`npm --workspace apps/mobile run android:debug` builds the Android debug APK at `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk` when the local Android SDK/JDK toolchain is available.

iOS directories are scaffolded, but iOS signing, provisioning, and release builds are not completed in this checkpoint.

## Server

The current app is local-first and can run without the server surface. A future hosted sync or team deployment should choose an explicit backend and database contract rather than treating local sync previews as a production service.
