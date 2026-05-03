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

## HTTP MCP foundation

P7-M1 adds a safe HTTP MCP subset in `packages/core/src/tools/http-mcp.ts`.

- HTTP MCP servers can be registered as local metadata with sanitized endpoints and headers.
- Tool inputs are validated against a small JSON-schema subset before any call.
- Tool capabilities pass through `evaluateToolInvocation`; terminal, code execution, network proxy, and stdio MCP remain blocked.
- Every call returns an audit record with redacted arguments, status, risk, confirmation metadata, result summary, or error.
- Web, Desktop, and Mobile share HTTP MCP capability. stdio MCP is implemented only as a Desktop control-plane capability in P7-M2; Web and Mobile keep it unavailable.

## Desktop plugin and stdio MCP manager

P7-M2 adds a Desktop-only control plane in `packages/core/src/tools/plugin-manager.ts`.

- Plugin manifests declare supported platforms, required permissions, provider feature needs, and runtime type.
- HTTP MCP plugins can be managed as shared metadata, while stdio MCP registration is Desktop-only.
- stdio MCP registration requires an explicit confirmation record and stores only a safe launcher id, sanitized args, and environment variable references. Runtime secrets are not persisted.
- Plugins install disabled by default. Enabling high-risk plugins re-checks `evaluateToolInvocation` and requires confirmation.
- Critical terminal, code execution, and network proxy plugin capabilities are blocked rather than installed or enabled.
- P7-M2 is a management and audit layer only. It does not add a Tauri shell, process spawn, cmd, PowerShell, or arbitrary terminal endpoint.

The Windows desktop shell does not currently provide terminal execution. The Tauri command allowlist is limited to native capability reporting, local Ollama port probing, and provider keychain operations; a regression test fails if a shell/process command appears in that allowlist.

## Desktop sandboxed code execution

P9-M1 adds a controlled Desktop-only code runner.

- Web and Mobile capability views keep code execution hidden and unavailable.
- The Web bridge invokes only `run_sandboxed_code`; it does not accept terminal, shell, cmd, PowerShell, or arbitrary command names.
- The Desktop command accepts a language enum (`javascript` or `python`), code text, optional stdin, a capped timeout, and safe environment variable references.
- The Rust runner writes code into a temporary sandbox directory, clears inherited environment variables, runs a fixed runner executable for the selected language, captures stdout/stderr, applies timeout/output limits, and deletes the sandbox directory.
- Execution requires explicit confirmation and redacted audit records. The generic `terminal` and generic `code_execution` capabilities remain blocked unless the dedicated Desktop sandbox policy is used.
