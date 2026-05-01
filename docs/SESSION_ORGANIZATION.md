# Session organization

P2 extension for keeping a larger personal workspace navigable without adding a
server account or team workspace.

## Scope

- Search local conversations by title, tags, and text message content.
- Filter conversations by active, archived, or all scope.
- Filter conversations by existing local tags.
- Pin important conversations above normal recency ordering.
- Archive conversations without deleting them.
- Move conversations to trash before permanent deletion.
- Restore trashed conversations back to the active list.

## Local-first behavior

Session organization metadata is stored on the chat session itself:

- `tags`
- `pinned`
- `archived`
- `deletedAt`
- `updatedAt`
- `syncState`

Saving organization metadata marks the session `dirty`, so sync previews and
backup archives can carry the same local state later.

Moving a conversation to trash also marks it `dirty`; permanent deletion removes
it only from the current local state.

## Privacy boundary

Search is in-browser only. No query, tag, title, or message text is sent to a
remote service by this feature.

The rendered conversation list escapes session titles and tag labels before
inserting them into the DOM.

## Verification

- `tests/web-state.test.mjs` covers persisted organization metadata.
- `tests/web-session-organizer.test.mjs` covers search, tag filtering, archive
  filtering, trash filtering, pinned sorting, counts, and rendered-label
  escaping.
- `npm run check` must pass before this sprint is considered complete.
