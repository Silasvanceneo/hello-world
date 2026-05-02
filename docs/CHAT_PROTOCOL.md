# Chat Protocol

Chat state follows this lifecycle:

```text
idle -> composing -> sending -> streaming -> completed
                         |          |
                         v          v
                       failed     aborted
```

## P0-M3 baseline

Implemented foundations:

- OpenAI-compatible SSE parser.
- Ollama NDJSON parser.
- Provider chat methods for `/chat/completions` and `/api/chat` streaming.
- Core chat engine that appends a user message, consumes normalized chunks, creates an assistant message, tracks usage, and keeps session updates immutable.
- Retry preparation by removing the last assistant message.
- User message edit that truncates later messages for regeneration.

Local persistence is handed off to P0-M4 storage adapters.

## P3-M1 branch foundation

Message branches are stored on a session separately from the main `messages`
timeline. A branch records the source `fromMessageId`, a title, branch-local
messages, and timestamps.

The Web shell can save the latest assistant reply as a local branch. This keeps
the main timeline unchanged and marks the session dirty for later sync/backup
visibility.

## P3-M2 long chat rendering foundation

The Web message list uses a windowed view for long conversations. By default it
renders the most recent messages and shows a local expand control for earlier
messages. The full `ChatSession.messages` array remains unchanged in state and
serialization; only the DOM rendering is limited.

## P3-M3 multi-window state coordination

The Web runtime coordinates local chat state across browser windows through the
`hello-world:web-state:v1` storage key. A window accepts incoming `storage`
events only when the persisted state has a newer timestamp revision than the
current in-memory state.

Before writing, the runtime checks local storage again. If another window has
already saved a newer state, the current window adopts that state instead of
overwriting it. This is a browser-local guard only; hosted sync and interactive
merge UI remain outside this sprint.

## P3-M4 branch preview and promotion

Branches can be previewed as the active message view without mutating the main
timeline. The preview replaces the source assistant message and following main
messages with the branch-local messages for rendering only.

When a branch is saved as main, the same derived timeline becomes
`ChatSession.messages`, the active branch marker is cleared, and the session is
marked dirty for local-first sync and backup visibility. Branch records are kept
as local history so the user can still inspect the alternative.

## P3-M5 Web retry and edit drafts

The Web message list exposes local Edit controls for user messages and Retry for
the latest assistant reply. Both actions move the relevant user prompt back into
the composer and truncate later messages before the next send.

This preserves the existing provider send path: after editing the composer text,
the normal Send action creates a new user message and assistant response. The
trimmed session is marked dirty so local sync and backup surfaces can see the
change.
