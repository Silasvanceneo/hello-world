# Web App

P0-M9 started the dependency-free Web shell. The current Web surface is now the shared UI for Web, Windows Desktop, and Android Mobile.

## Implemented

- Responsive chat workspace with dedicated Settings navigation.
- Local-first session state via `localStorage`.
- New chat, message composer, stop/retry/edit/branch foundations, comparison, prompt templates, agent presets, and session organization.
- Real provider runtime for native OpenAI Responses, Anthropic Messages, Gemini, Azure OpenAI, DashScope, Ollama, and OpenAI-compatible cloud or relay endpoints.
- Runtime-only provider API keys. App state stores only provider metadata and an `apiKeyRef` marker.
- Explicit provider model refresh. Cloud model IDs can be pulled from compatible provider list endpoints, while manual model IDs remain supported.
- Token usage capture from provider responses when available, with local token estimates as fallback.
- OpenAI, Azure OpenAI, and OpenAI-compatible image generation through the Provider Image model field and composer Generate image action.
- File attachment chips, drag-and-drop attachments, native screenshot/clipboard/photo paths where the platform supports them, and RAG ingestion status.
- Advanced settings for RAG, Web search, HTTP MCP, Desktop plugin/stdio MCP controls, Desktop sandboxed code execution, and the platform capability matrix.
- PWA manifest and service worker registration.
- Static build script: `npm run build:web` writes `apps/web/build`.

## Limits

The pure Web/PWA surface is still subject to browser CORS. Some cloud providers save successfully but fail validation or chat from the browser until the provider enables CORS or the user routes through a CORS-enabled self-hosted gateway. The Windows Desktop app avoids this for normal cloud provider calls through the restricted Tauri provider fetch bridge.

Local echo remains available when no provider is configured. Web and Mobile do not expose stdio MCP, Desktop provider proxy controls, sandboxed code execution, or terminal access.
