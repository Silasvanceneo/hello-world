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

## Web presets

The Web settings surface includes provider presets for native cloud APIs, OpenAI-compatible cloud APIs, relay gateways, and local runtimes. These presets are convenience metadata only; they do not include credentials. Direct browser validation still follows each provider's CORS policy.

Native protocol presets are exposed only after dedicated adapters and mocked request/streaming tests exist.

## P5-M1 provider runtime v2 boundary

Adapters now expose `ProviderRuntimeCapabilities` so the registry can describe provider support without live credentials or network calls. The capability descriptor covers protocol, transport, browser-direct expectations, model listing, streaming chat, embeddings, image generation, audio, and tool-call support.

Current v2 baseline:

- OpenAI-compatible adapters advertise HTTPS, CORS-dependent browser access, model listing, and streaming chat.
- OpenAI uses the native Responses API shape: `/responses` streaming with `response.output_text.delta` events.
- Anthropic uses the native Messages API shape: `/messages`, `x-api-key`, `anthropic-version`, and `content_block_delta` text deltas.
- Gemini uses native `streamGenerateContent?alt=sse` with `x-goog-api-key` and candidate part text extraction.
- Azure OpenAI uses deployment-scoped `/openai/deployments/{deployment}/chat/completions?api-version=...` with `api-key`.
- DashScope native uses `/services/aigc/text-generation/generation`, `x-dashscope-sse: enable`, and Bearer runtime auth.
- Ollama advertises local HTTP, browser-direct support, model listing, and streaming chat.
- Embeddings, image generation, audio, and tool-call support remain capability descriptors until dedicated non-chat paths are implemented and tested.

All provider API keys remain runtime-only. `ProviderConnection` persists only `apiKeyRef`, and backup export strips that reference.

## P0-M3 handoff

The adapters currently return a normalized error chunk for chat because streaming chat belongs to P0-M3. The registry and validation boundary are ready for that work.
