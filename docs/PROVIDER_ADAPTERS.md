# Provider Adapters

Provider differences must be contained in `packages/api-client`.

P0 adapters:

1. OpenAI-compatible
2. Ollama
3. one non-OpenAI hosted provider through the existing gateway

Adapters expose model listing, connection validation, and chat streaming. UI code should consume normalized models, chunks, and errors only.
