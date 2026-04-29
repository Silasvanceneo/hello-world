# Chat Protocol

Chat state follows this lifecycle:

```text
idle -> composing -> sending -> streaming -> completed
                         |          |
                         v          v
                       failed     aborted
```

Core message content supports text, image, file, tool call/result, reasoning, and citation blocks. Streaming emits normalized chunks so UI rendering is provider-agnostic.
