# Desktop

P0: create a Tauri shell that can load the shared Web UI and access local configuration safely.

P1 adds screenshot Q&A, clipboard image Q&A, local Ollama detection, system tray actions, a desktop capture shortcut, and Windows Credential Manager-backed provider secret commands.

The tray exposes Show, Capture screen, and Quit. The `Ctrl+Shift+H` shortcut requests the same shared screenshot capture flow when Windows accepts the hotkey registration.

Desktop keychain support is intentionally limited to Tauri commands for provider secret save/read/delete. Web local state and backup archives continue to store only provider metadata and `apiKeyRef`; secret values are not serialized.

Desktop provider calls use the `desktop_provider_fetch` Tauri command when the shared Web UI is running inside the Windows app. This is a provider-only network bridge, not a terminal or arbitrary proxy: it allows `GET` and `POST`, requires HTTPS except for local Ollama on `127.0.0.1:11434`, blocks URL credentials, blocks unapproved headers, disables redirects, and caps request/response sizes. The pure Web/PWA build still needs provider CORS support or a self-hosted gateway.

P9 adds controlled sandboxed code execution for Desktop only. The Tauri command is `run_sandboxed_code`; it accepts only `javascript` or `python` snippets, writes them to a temporary sandbox directory, clears inherited environment variables, captures output, applies timeout/output limits, and removes the temporary directory after execution. It is not a terminal or arbitrary shell endpoint.

High-risk local capabilities must remain off unless explicitly enabled by the user.
