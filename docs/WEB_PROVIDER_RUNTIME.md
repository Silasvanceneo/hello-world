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
- Stop button backed by `AbortController`.
- Local echo remains available when no provider is configured.
- Provider presets for common cloud APIs and relay gateways. Presets fill only provider metadata: name, type, base URL, and default model.

## Preset catalog

`apps/web/src/provider-presets.js` groups presets into cloud APIs, gateways/relays, and local runtimes. Current presets include native OpenAI, Anthropic, Google Gemini, Azure OpenAI, Alibaba Qwen/DashScope, plus xAI, DeepSeek, Baidu Qianfan, Tencent Hunyuan, Volcengine Ark, Moonshot Kimi, Zhipu GLM, Mistral, Groq, Together AI, Fireworks AI, Cerebras, OpenRouter, Claude through OpenRouter, SiliconFlow, AiHubMix, 302.AI, One API relay, and Ollama.

Native presets use native request shapes. Relay and compatible presets continue through `/models` and `/chat/completions`.

## Caveats

Browser CORS rules still apply. For many hosted providers, users should route through the planned self-hosted gateway instead of calling the provider directly from the browser.
