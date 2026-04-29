# Storage Model

P0-M4 storage is local-first and snapshot-backed.

## Implemented adapters

- `createIndexedDBStorageAdapter` for Web/PWA local history and settings.
- `createJsonFileStorageAdapter` for Desktop/server-style local JSON persistence.
- `createMobileStorageAdapter` for Capacitor-style key-value persistence.
- `createKeyValueStorageAdapter` as a shared persistence contract for browser/mobile stores.

## Persisted entities

- Chat sessions
- Provider connections, storing only `apiKeyRef`
- App settings

## Safety

Adapters return `StorageResult<T>` instead of silently throwing. Concrete UI should surface user-friendly errors while preserving detailed diagnostics for local logs with secret redaction.
