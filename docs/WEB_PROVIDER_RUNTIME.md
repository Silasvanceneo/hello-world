# Web Provider Runtime

P0-M10 wires the dependency-free Web MVP to real provider streaming paths.

## Implemented

- Runtime-only API key handling in the browser tab. The app state stores only `apiKeyRef` metadata.
- OpenAI Responses `/responses` streaming support.
- OpenAI-compatible `/chat/completions` streaming support for compatible clouds and relays.
- Anthropic Messages `/messages` streaming support.
- Gemini native `streamGenerateContent?alt=sse` streaming support.
- Azure OpenAI deployment-scoped chat completions streaming support.
- DashScope native Qwen text-generation SSE support.
- Ollama `/api/chat` streaming support.
- Provider model-list validation for native, OpenAI-compatible, Azure deployment, DashScope, and Ollama endpoints.
- Explicit model refresh in Provider settings. `Refresh models` pulls the provider model list into the Model field suggestions while still allowing manual model IDs for providers that do not expose complete listings.
- Desktop provider fetch proxy for the Windows Tauri app. When `window.__TAURI__` is present, provider validation and chat streaming route through the Desktop app instead of browser `fetch`, avoiding browser CORS failures for normal cloud API calls.
- Token usage capture for provider chat. Streaming parsers preserve usage chunks when providers return them; the Web runtime falls back to a local token estimate so the topbar and Cost panel update after each cloud response.
- OpenAI/OpenAI-compatible image generation through `/images/generations`. The Provider panel exposes an Image model field, the composer exposes `Generate image`, and generated images are saved as local session attachments with visible token usage metadata.
- Stop button backed by `AbortController`.
- Local echo remains available when no provider is configured.
- Provider presets for common cloud APIs and relay gateways. Presets fill only provider metadata: name, type, base URL, and default model.

## Preset catalog

`apps/web/src/provider-presets.js` groups presets into cloud APIs, gateways/relays, and local runtimes. Current presets include native OpenAI, Anthropic, Google Gemini, Azure OpenAI, Alibaba Qwen/DashScope, plus xAI, DeepSeek, Baidu Qianfan, Tencent Hunyuan, Volcengine Ark, Moonshot Kimi, Zhipu GLM, Mistral, Groq, Together AI, Fireworks AI, Cerebras, OpenRouter, Claude through OpenRouter, SiliconFlow, AiHubMix, 302.AI, One API relay, and Ollama.

Native presets use native request shapes. Relay and compatible presets continue through `/models` and `/chat/completions`.

## Caveats

Browser CORS rules still apply in the pure Web/PWA surface. If a hosted provider blocks direct browser requests, the Web app will save the provider metadata but report a Network/CORS failure during validation or chat. Use one of these paths:

- Windows Desktop app: provider requests use the Tauri `desktop_provider_fetch` command, so cloud APIs are called by the local desktop process rather than the browser.
- Pure Web/PWA: use a self-hosted gateway/relay with CORS enabled, or choose a provider endpoint that explicitly supports browser CORS.
- Local Ollama: `http://127.0.0.1:11434` remains the only HTTP provider endpoint allowed by the Desktop proxy; other remote endpoints must use HTTPS.

Image generation currently covers OpenAI, Azure OpenAI, and OpenAI-compatible image endpoints. Anthropic, Gemini, DashScope text generation, and Ollama remain chat/validation-only in this Web runtime until dedicated image APIs are implemented.
