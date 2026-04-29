# Web MVP

P0-M9 turns the Web shell into a deployable dependency-free MVP.

## Implemented

- Responsive three-column UI: history, chat, settings.
- Local-first session state via `localStorage`.
- New chat, message composer, local echo assistant, and token estimate display.
- Provider settings form that stores only a local `apiKeyRef` marker in app state.
- File attachment chips for P0 file types.
- PWA manifest and service worker registration.
- Static build script: `npm run build:web` writes `apps/web/build`.

## Limits

This Web MVP intentionally uses a local echo assistant until live provider wiring and user-managed API-key runtime are added to the UI. The provider/chat core modules already support OpenAI-compatible and Ollama streaming.
