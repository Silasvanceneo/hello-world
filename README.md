# hello-world

`hello-world` is a local-first, self-hostable AI client for Web, Desktop, and Mobile.

## Current status

The P5-P10 roadmap is implemented through the local harness:

- native provider adapters for major cloud APIs
- mature RAG ingestion, hybrid retrieval, citations, and evals
- HTTP MCP plus Desktop-only stdio MCP/plugin management
- Web search and grounded answers
- Desktop-only sandboxed JavaScript/Python code execution
- final three-platform capability matrix and verification gates

## Principles

- Local-first history and settings.
- Shared core across Web/Desktop/Mobile.
- Provider adapters isolate model-specific behavior.
- Dangerous tools are disabled by default.
- Personal/small-team scope; no SaaS billing or enterprise control plane in P0/P1/P2.

## Useful commands

```powershell
npm run check
npm run build:desktop
npm run build:mobile
```

`npm run check` verifies structure, runs the full test suite, builds the Web app, and runs the source review gate.
