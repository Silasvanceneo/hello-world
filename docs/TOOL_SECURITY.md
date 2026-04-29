# Tool Security

P0-M8 implements a small, test-covered policy layer for local tool safety.

## Core files

- `packages/shared/src/types/security.ts`
- `packages/core/src/security/security-policy.ts`
- `apps/web/src/security-settings.ts`
- `tests/security-policy.test.ts`

## Principles

Terminal, code execution, stdio MCP, and broad filesystem access are off by default. Medium and high-risk tools require explicit user confirmation. Secrets are redacted before display/logging.
