# Prompt Templates

P2-M2 adds a local-first prompt template library for reusable personal workflows.

## Fields

Each template stores:

- `title`
- `body` with `{{ variable }}` placeholders
- `variables`
- `tags`
- `favorite`
- `scope` as `local` or `sync`
- timestamps for local sync planning and conflict handling

## Runtime behavior

- Templates are saved in Web local state and the shared storage snapshot contract.
- Variables are inferred from `{{ name }}` placeholders when the variables field is empty.
- Applying a template renders provided Variables JSON into the body and appends the result to the composer.
- Missing variables remain visible as placeholders and are reported in the UI.
- Import/export helpers use a deterministic JSON envelope for backup and sync-preview flows.

## Scope boundary

This is still local-first. `sync` is stored as metadata and participates in the local sync manifest/preview layer from P2-M5. The project does not ship a hosted sync backend, account flow, or team template sharing service in this release.
