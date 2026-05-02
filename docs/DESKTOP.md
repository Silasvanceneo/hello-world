# Desktop

P0: create a Tauri shell that can load the shared Web UI and access local configuration safely.

P1 adds screenshot Q&A, clipboard image Q&A, local Ollama detection, system tray actions, a desktop capture shortcut, and Windows Credential Manager-backed provider secret commands.

The tray exposes Show, Capture screen, and Quit. The `Ctrl+Shift+H` shortcut requests the same shared screenshot capture flow when Windows accepts the hotkey registration.

Desktop keychain support is intentionally limited to Tauri commands for provider secret save/read/delete. Web local state and backup archives continue to store only provider metadata and `apiKeyRef`; secret values are not serialized.

High-risk local capabilities must remain off unless explicitly enabled by the user.
