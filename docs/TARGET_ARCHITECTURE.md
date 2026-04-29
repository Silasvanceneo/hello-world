# Target Architecture

## Scope

P0 builds the foundation for a shared AI client across Web, Desktop, and Mobile.

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

Client UI calls `packages/core`; core persists through `packages/storage` and sends model requests through `packages/api-client`. Provider-specific quirks stay inside adapters. Server APIs are optional for local-first P0 except where remote providers, file parsing, or sync are required.

## Non-goals

No billing ledger, tenant admin suite, enterprise SSO, plugin marketplace, or complex workflow orchestration in P0/P1/P2.
