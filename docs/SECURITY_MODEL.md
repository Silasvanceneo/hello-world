# Security Model

## Defaults

Dangerous capabilities are disabled by default:

- Terminal/shell execution
- Code execution
- stdio MCP
- broad filesystem access
- arbitrary local command tools

## Implemented P0-M8 policy

- `defaultSecuritySettings` keeps terminal, code execution, stdio MCP, and broad filesystem access off.
- Tool capabilities are classified as low, medium, high, or critical risk.
- Low-risk read-only tools can run without confirmation.
- Medium-risk tools require confirmation.
- High-risk tools require confirmation when their capability is enabled.
- Critical terminal/code/network-proxy tools are blocked by default.
- Critical tools remain blocked even if the current advanced toggles are manually enabled; enabling them requires a future explicit policy change.
- Agent preset `enabledTools` values are descriptive preferences only. They are mapped through `evaluateAgentPresetToolPolicy` before any execution decision.
- Plugin manifests are descriptive until enabled. Installation keeps plugins disabled by default, and enablement re-checks the shared tool policy plus confirmation requirements.
- Desktop stdio MCP registration is a control-plane record only: it is Desktop-only, requires explicit confirmation, accepts only safe launcher ids, and stores env var references instead of secret values.
- The current Desktop Tauri allowlist exposes capability reporting, local Ollama port detection, provider secret storage/read/delete, a restricted provider fetch bridge, and one controlled sandbox runner command. It does not expose a terminal, shell, PowerShell, cmd, or arbitrary command endpoint.
- `desktop_provider_fetch` is intentionally narrower than a generic proxy: it allows only provider-style GET/POST HTTP requests, requires HTTPS except for local Ollama on `127.0.0.1:11434`, rejects URL credentials, accepts only a small allowlist of provider headers, disables redirects, and enforces request/response size limits.
- Desktop code execution is a special P9 controlled-runner path. It is hidden on Web/Mobile, requires the code execution setting plus explicit confirmation, accepts only `javascript` or `python`, writes temporary snippet files in an isolated temp directory, clears inherited environment variables, enforces timeout/output limits, and records redacted audit metadata.
- Secret redaction is available for text and structured objects.

## Tool risk levels

| Level | Examples | Policy |
|---|---|---|
| Low | time, read-only search | may auto-run after configuration |
| Medium | HTTP API, knowledge reads | first-use confirmation |
| High | file writes, broad local filesystem, stdio MCP | explicit confirmation and capability gate |
| Critical | shell, code execution, network proxy | blocked by default |

## API keys

- Never render a saved key in full.
- Scrub keys from errors and logs.
- Delete stored secret material when a provider connection is deleted.
- Prefer platform secure storage in Desktop/Mobile P1.
