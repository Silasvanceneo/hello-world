# Desktop

P0: create a Tauri shell that can load the shared Web UI and access local configuration safely.

P1 adds screenshot Q&A, clipboard image Q&A, and local Ollama detection. Tray, global shortcuts, and keychain-backed secrets remain explicitly deferred until the desktop shell adds the required Tauri plugins and permission UI.

High-risk local capabilities must remain off unless explicitly enabled by the user.
