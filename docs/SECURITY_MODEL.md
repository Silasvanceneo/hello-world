# Security Model

## Defaults

Dangerous capabilities are disabled by default:

- Terminal/shell execution
- Code execution
- stdio MCP
- broad filesystem access
- arbitrary local command tools

## Tool risk levels

| Level | Examples | Policy |
|---|---|---|
| Low | time, read-only search | may auto-run after configuration |
| Medium | HTTP API, knowledge reads | first-use confirmation |
| High | file writes, local commands | confirm every run |
| Critical | shell, delete, network proxy | blocked by default |

## API keys

- Never render a saved key in full.
- Scrub keys from errors and logs.
- Delete stored secret material when a provider connection is deleted.
- Prefer platform secure storage in Desktop/Mobile P1.
