# Provider Adapters

Provider differences are contained in `packages/api-client`.

## P0-M2 scope

Implemented baseline:

1. OpenAI-compatible model listing and validation.
2. Ollama model listing and validation.
3. Provider registry helpers for lookup, model listing, and connection validation.
4. Core provider store helpers for adding, updating, and deleting provider connections immutably.
5. Web provider-settings view-model helpers for connection forms and user-readable status summaries.

## Secret handling

`ProviderConnection` stores only `apiKeyRef`. Runtime API keys are passed through `ProviderRuntimeContext` and must not be persisted in client state or logs.

## P0-M3 handoff

The adapters currently return a normalized error chunk for chat because streaming chat belongs to P0-M3. The registry and validation boundary are ready for that work.
