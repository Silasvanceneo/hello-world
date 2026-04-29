# Connection Diagnostics

P1-M6 adds user-readable provider health checks.

## Covered diagnostics

- API key / authorization failures.
- Browser CORS or generic network failures.
- TLS/certificate failures.
- Proxy and route failures.
- Local Ollama unreachable.
- Empty model lists.
- Configured model missing with fallback suggestion.

## Core API

`packages/core/src/provider/connection-diagnostics.ts` exposes:

- `runProviderHealthCheck` for one-click validation through the provider registry.
- `createProviderHealthReport` to turn `ConnectionStatus` into findings.
- `explainConnectionFailure` to map common provider errors to user actions.

## Web behavior

`apps/web/src/provider-diagnostics.js` formats validation results for the Web settings panel. It avoids exposing runtime API keys and gives direct next actions for common failures.
