# Web Provider Runtime

P0-M10 wires the dependency-free Web MVP to real provider streaming paths.

## Implemented

- Runtime-only API key handling in the browser tab. The app state stores only `apiKeyRef` metadata.
- OpenAI-compatible `/chat/completions` streaming support.
- Ollama `/api/chat` streaming support.
- Provider model-list validation for OpenAI-compatible and Ollama endpoints.
- Stop button backed by `AbortController`.
- Local echo remains available when no provider is configured.

## Caveats

Browser CORS rules still apply. For many hosted providers, users should route through the planned self-hosted gateway instead of calling the provider directly from the browser.
