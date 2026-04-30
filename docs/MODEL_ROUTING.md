# Model Routing

P2-M3 adds simple local-first model routing for personal workflows.

## Strategies

- `balanced`: keep the normal provider order.
- `cheap`: prefer low-cost mini/small models.
- `fast`: prefer low-latency small models.
- `long-context`: prefer models with larger inferred context windows.
- `privacy`: prefer local/Ollama providers.
- `fallback`: avoid routes that have already failed and choose the next compatible provider.

## Compatibility

Routing filters unavailable or incompatible candidates before scoring. The core router uses existing model capability metadata for text, vision, files, tools, reasoning, and image-generation tasks.

The Web router infers basic compatibility from provider type, local URLs, and model names so the static app can route without adding a backend service.

## Runtime behavior

- The Web settings panel stores a selected routing strategy in local state.
- Normal sends use the router to pick an enabled provider and model.
- Active Agent preset model overrides still win after the provider route is selected.
- API keys remain runtime-only; routing never persists secrets.

This is intentionally simple. Full routing with health history, budgets, and live latency telemetry can build on this foundation in later P2 work.
