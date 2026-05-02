# Final Capability Matrix

P10-M1 records the implemented capability boundary across the three app surfaces.

## Shared Safe Capabilities

Web, Desktop, and Mobile all support:

- cloud/local chat through the shared provider runtime
- native provider adapters where runtime networking and credentials allow
- RAG query with hybrid retrieval and citations
- Web search result normalization and grounded answer citation validation
- HTTP MCP as the safe shared tool subset

## Desktop-Only Capabilities

Desktop additionally supports:

- Desktop keychain-backed provider secret storage
- local Ollama detection
- screenshot/clipboard workflows
- directory import and durable RAG index mode
- Desktop proxy fallback for grounded page extraction
- stdio MCP registration and plugin management behind policy and confirmation
- sandboxed JavaScript/Python code execution through the controlled `run_sandboxed_code` command

Desktop does not expose a terminal, shell, cmd, PowerShell, or arbitrary command endpoint.

## Mobile Capabilities

Mobile supports:

- shared chat/provider/RAG/search/HTTP MCP safe subset
- Capacitor Camera image capture
- voice input and speech playback when the WebView exposes speech APIs
- secure storage foundation through the installed Capacitor secure storage plugin

Mobile does not support stdio MCP, Desktop proxy, sandboxed code execution, or terminal/shell access.

## Verification

The final matrix is generated and tested by:

- `packages/core/src/diagnostics/platform-capability-matrix.ts`
- `tests/platform-capability-matrix.test.ts`

The matrix validates P10 acceptance coverage for Web, Desktop, and Mobile before the harness can mark the roadmap complete.
