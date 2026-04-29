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
