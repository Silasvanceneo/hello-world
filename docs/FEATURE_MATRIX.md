# Feature Matrix

| Feature | Web | Desktop | Mobile | Notes |
|---|---:|---:|---:|---|
| Cloud/local chat | yes | yes | yes | Runtime provider keys are not serialized. |
| Native providers | yes | yes | yes | OpenAI Responses, Anthropic, Gemini, Azure OpenAI, DashScope, Ollama, OpenAI-compatible. |
| RAG query | yes | yes | yes | Hybrid retrieval, citations, no-answer threshold, evals. |
| RAG management | yes | yes | yes | Desktop adds directory import and durable-index mode. |
| Web search | yes | yes | yes | Brave, Tavily, Bing, SearXNG, custom endpoints. |
| HTTP MCP | yes | yes | yes | Shared safe subset with schema validation and audit records. |
| stdio MCP | no | desktop-only | no | Registered disabled by default; enablement requires confirmation and policy gates. |
| Desktop page proxy | no | desktop-only | no | Used for grounded page fetch fallback. |
| Sandboxed code execution | no | desktop-only | no | JavaScript/Python controlled runner, no arbitrary shell endpoint. |
| Voice input/TTS | browser-dependent | browser-dependent | yes when WebView supports APIs | Mobile exposes voice helpers from shared UI. |
| Camera input | no | screenshot/clipboard instead | yes | Capacitor Camera on Android. |
| Terminal/shell | blocked | blocked | blocked | No arbitrary terminal, cmd, PowerShell, or shell command endpoint. |
