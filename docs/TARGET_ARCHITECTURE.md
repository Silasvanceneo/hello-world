# Target Architecture

## Scope

The project now has a shared AI client foundation across Web, Desktop, and Mobile, plus the P5-P10 capability expansion for native providers, mature RAG, MCP/plugins, Web search, Desktop code execution, and final diagnostics.

```text
apps/web       -> SvelteKit/PWA entry
apps/desktop   -> Tauri shell loading the shared web UI
apps/mobile    -> Capacitor shell for Android-first mobile MVP
packages/shared -> shared contracts and constants
packages/api-client -> provider adapters and streaming boundary
packages/core  -> chat/session/settings domain logic
packages/storage -> storage adapter contracts
packages/ui    -> reusable UI surface
server/open_webui -> FastAPI gateway/sync/file/usage APIs
```

## Data flow

Client UI calls `packages/core`; core persists through `packages/storage` and sends model/search requests through `packages/api-client`. Provider-specific quirks stay inside adapters. Desktop-only capabilities enter through narrow Tauri commands and remain separated from the shared Web/Mobile-safe subset.

## Non-goals

No billing ledger, tenant admin suite, enterprise SSO, public plugin marketplace, or arbitrary terminal shell endpoint.
