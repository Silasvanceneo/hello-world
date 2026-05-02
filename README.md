# hello-world

![hello-world product overview](docs/assets/hero.svg)

`hello-world` is a local-first, self-hostable AI workspace for Web, Windows Desktop, and Mobile. It combines multi-provider chat, RAG, Web search, MCP tooling, and Desktop-only sandboxed code execution behind explicit safety boundaries.

[![Tests](https://img.shields.io/badge/tests-215%20passing-166052)](#verification)
[![Platforms](https://img.shields.io/badge/platforms-Web%20%7C%20Desktop%20%7C%20Mobile-315f9d)](#platforms)
[![Security](https://img.shields.io/badge/terminal-blocked-9f4d2f)](#security-model)

## Why It Exists

Most AI clients force a tradeoff between local control, multi-provider flexibility, knowledge workflows, and safe tool execution. `hello-world` is built as a personal and small-team client where the user owns state, providers are interchangeable, and dangerous capabilities do not appear unless the platform and policy explicitly allow them.

## Product Tour

![Capability map](docs/assets/capability-map.svg)

The app has a dedicated Settings workspace where these capabilities are visible and configurable:

- Providers: OpenAI-compatible, OpenAI Responses, Anthropic, Gemini, Azure OpenAI, DashScope, Ollama, and relay gateways.
- RAG: ingestion, chunking, local embeddings, hybrid retrieval, citations, reranking hooks, and eval reporting.
- Web search: Brave, Tavily, Bing, SearXNG, and custom endpoints with grounded answer citation validation.
- MCP and plugins: HTTP MCP shared across all clients; Desktop stdio MCP/plugin control plane behind confirmation.
- Desktop code: JavaScript/Python snippets through a controlled sandbox runner only.
- Capability matrix: shows what is available, Desktop-only, unavailable, or blocked.

## Platforms

| Capability | Web | Desktop | Mobile |
| --- | --- | --- | --- |
| Cloud/local chat | yes | yes | yes |
| Native provider adapters | yes | yes | yes |
| RAG query and citations | yes | yes | yes |
| RAG directory import / durable index | no | yes | no |
| Web search and grounded answers | yes | yes | yes |
| HTTP MCP | yes | yes | yes |
| stdio MCP / plugin manager | no | Desktop-only | no |
| Sandboxed JS/Python code execution | no | Desktop-only | no |
| Camera input | no | no | yes |
| Voice input/playback | runtime-dependent | runtime-dependent | runtime-dependent |
| Terminal / arbitrary shell | blocked | blocked | blocked |

## Architecture

![Architecture](docs/assets/architecture.svg)

```text
apps/web       PWA and shared UI runtime
apps/desktop   Tauri shell, tray, keychain, sandbox command bridge
apps/mobile    Capacitor shell with camera/share/secure-storage foundations

packages/core        chat, RAG, search grounding, MCP policy, model routing
packages/api-client  provider adapters, streaming, Web search adapters
packages/storage     local-first persistence adapters
packages/shared      shared types and contracts
```

## Security Model

![Security boundary](docs/assets/security-boundary.svg)

Security invariants:

- API keys are runtime-only and are not serialized into local state or backups.
- Web and Mobile do not expose stdio MCP, Desktop proxy, sandboxed code execution, terminal, cmd, PowerShell, or arbitrary process execution.
- Desktop sandboxed code execution accepts only `javascript` or `python`, requires confirmation, clears inherited environment, caps timeout/output, and runs through a narrow Tauri command.
- Critical tools remain blocked by policy tests even if a user-facing setting is toggled.

## Quick Start

Prerequisites:

- Node.js and npm
- Rust toolchain for Desktop builds
- Android SDK for Android builds
- Optional: Ollama for local models

```powershell
npm install
npm run check
```

Run the Web build:

```powershell
npm run build:web
```

Build the Windows Desktop executable:

```powershell
npm run build:desktop
```

Build/sync the Mobile Android project:

```powershell
npm run build:mobile
```

## Configuration

Open the app, then go to `Settings`.

Key sections:

- `Provider`: provider type, base URL, model, runtime-only API key, local Ollama detection.
- `Agent`: system prompt, default model override, safe tool preferences, knowledge scope.
- `Prompts`: reusable local prompt templates.
- `Routing`: balanced, cheap, fast, long-context, privacy, and fallback routing.
- `Advanced`: RAG, Web search, MCP/plugins, Desktop code execution, and platform capabilities.
- `Security`: blocked terminal, code execution, stdio MCP, and broad filesystem defaults.

## Verification

Current local verification:

```powershell
npm run check
npm run build:desktop
npm run build:mobile
npm audit --omit=dev --audit-level=moderate
```

Latest verified state:

- `npm run check`: scaffold check passed, 215 tests passed, Web build passed, review gate passed.
- `npm run build:desktop`: built `apps/desktop/src-tauri/target/release/hello-world-desktop.exe`.
- `npm run build:mobile`: Capacitor Android sync and scaffold verification passed.
- `npm audit --omit=dev --audit-level=moderate`: 0 vulnerabilities.

## Release

Release notes are maintained in [docs/releases/v0.1.0.md](docs/releases/v0.1.0.md).

Suggested GitHub Release assets:

- `apps/desktop/src-tauri/target/release/hello-world-desktop.exe`
- `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`

## Documentation

- [Final capability matrix](docs/FINAL_CAPABILITY_MATRIX.md)
- [Provider adapters](docs/PROVIDER_ADAPTERS.md)
- [Knowledge base and RAG](docs/KNOWLEDGE_BASE.md)
- [Web search](docs/WEB_SEARCH.md)
- [Tool security](docs/TOOL_SECURITY.md)
- [Desktop notes](docs/DESKTOP.md)
- [Mobile notes](docs/MOBILE.md)

## Project Status

The P5-P10 roadmap is implemented and checkpointed:

- Native provider runtime and adapters
- Mature RAG ingestion/retrieval/evals
- HTTP MCP plus Desktop stdio MCP/plugin control plane
- Web search and grounded answers
- Desktop-only sandboxed code execution
- Three-platform capability matrix
- Visible Advanced Settings configuration
