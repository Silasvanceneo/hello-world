# Import and export

P2-M6 adds local import/export and backup foundations for personal data
portability. The feature is file/text based and does not require a hosted
account.

## Exports

- **Single-session Markdown**: exports the active chat as readable Markdown.
- **JSON backup**: exports sessions, provider metadata, agent presets, prompt
  templates, usage budget settings, and sync settings as a `hello-world` v1
  archive.

Markdown exports redact obvious sensitive text such as API-key literals and
authorization bearer values.

## Restore

The Web backup panel can restore a `hello-world` v1 JSON archive into local
state. Restoring replaces local sessions/providers/agents/templates from the
archive and keeps provider API keys out of restored state.

Provider API keys are runtime-only and must be re-entered after restore.

## Imports

The core import/export module includes normalizers for:

- ChatGPT conversation exports with `mapping` nodes.
- Open WebUI exports with `chats`, `chat.messages`, `messages`, or
  `chat.history.messages`.

Imported sessions are marked `dirty` so later sync previews treat them as local
changes that should not be silently overwritten.

## Privacy boundary

- Provider `apiKeyRef` values are stripped from JSON backup archives.
- Web restore rejects non-`hello-world` v1 archives.
- This feature does not upload backup files or imported data anywhere.

## Verification

- `tests/import-export.test.ts` covers Markdown export, JSON backup/restore,
  ChatGPT import, and Open WebUI import.
- `tests/web-backup-dashboard.test.mjs` covers Web backup archive creation,
  restore, summaries, and redacted Markdown.
- `npm run check` must pass before this sprint is considered complete.
