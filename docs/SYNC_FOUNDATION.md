# Sync foundation

P2-M5 adds a local-first sync foundation. It does not add a hosted sync service or
real cloud account flow yet.

## Scope

- Chat sessions can be represented as sync items.
- App settings, provider metadata, prompt templates, agent presets, and knowledge
  document metadata can be represented as sync items.
- Knowledge sync deliberately excludes document body text and page text at this
  layer; only metadata is included.
- Web settings can persist a sync endpoint and selected scopes locally.
- Web settings can preview pending local uploads and visible conflicts without
  sending a network request.
- Web windows coordinate the local storage snapshot so newer browser-tab writes
  are adopted instead of silently overwritten by stale windows.

## Local-first rules

Local writes remain the source of truth for the current device. Sync failures must
not block local chat, prompt, agent, or settings usage.

The sync planner separates work into:

- `upload`: local items that should be sent to a future sync backend.
- `download`: remote items that can be applied locally.
- `conflicts`: local dirty items where the remote copy also changed.

Conflicts are never silently overwritten. A caller must explicitly choose
`keep-local` or `use-remote` through `resolveSyncConflict`.

Within a single browser profile, `apps/web/src/multi-window-sync.js` listens for
`storage` events on `hello-world:web-state:v1`. Incoming snapshots are accepted
only when their timestamp revision is newer than the current in-memory state.
Save operations also check the stored revision immediately before writing, so an
older window does not overwrite a newer chat snapshot.

## Security and privacy boundary

- API keys and sync access tokens are not persisted in Web state.
- Endpoint values are trimmed and secret-like URL params are removed before
  storage.
- Knowledge body text is excluded from sync manifests.
- This feature creates manifests and previews only; it does not transmit data.

## Verification

- `tests/sync-engine.test.ts` covers sync item collection, planning, and explicit
  conflict resolution.
- `tests/web-sync-dashboard.test.mjs` covers Web sync settings sanitization,
  dashboard counts, and stable scope parsing.
- `tests/web-multi-window-sync.test.mjs` covers cross-window storage adoption,
  stale event rejection, invalid payload handling, unsubscribe behavior, and
  stale write protection.
- `npm run check` must pass before this sprint is considered complete.
