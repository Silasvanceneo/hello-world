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
- The current Desktop Tauri allowlist exposes only capability reporting, local Ollama port detection, provider secret storage, provider secret read, and provider secret deletion. It does not expose a terminal, shell, process spawn, or arbitrary command endpoint.
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
