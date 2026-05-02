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
