# Tool Security

P0-M8 implements a small, test-covered policy layer for local tool safety.

## Core files

- `packages/shared/src/types/security.ts`
- `packages/core/src/security/security-policy.ts`
- `packages/core/src/agent/agent-preset.ts`
- `apps/web/src/security-settings.ts`
- `tests/security-policy.test.ts`
- `tests/agent-presets.test.ts`
- `tests/desktop-command-allowlist.test.mjs`

## Principles

Terminal, code execution, stdio MCP, and broad filesystem access are off by default. Medium and high-risk tools require explicit user confirmation. Secrets are redacted before display/logging.

Agent presets can store tool identifiers for future workflow planning, but those identifiers are not execution grants. `evaluateAgentPresetToolPolicy` maps each preset tool to the shared security policy before a runtime can treat it as callable.

The Windows desktop shell does not currently provide terminal execution. The Tauri command allowlist is limited to native capability reporting, local Ollama port probing, and provider keychain operations; a regression test fails if a shell/process command appears in that allowlist.
