# Agent Presets

P2-M1 adds local-first agent presets for personal workflows without changing the security model.

## Fields

Each preset stores:

- `name` for the user-facing persona.
- `systemPrompt` prepended to provider calls at runtime.
- `defaultModelId` as an optional model override.
- `enabledTools` as a deterministic list of tool identifiers.
- `knowledgeBase` binding with `none`, `session`, or `library` scope.
- `icon` as a small text mark for the UI.

## Runtime behavior

- Presets are saved in local Web state and in the shared storage snapshot contract.
- The active preset's system prompt is prepended to provider messages.
- The active preset's default model overrides the provider default for normal send.
- Enabled tools are descriptive defaults only; they do not grant execution permission.
- Runtime code must evaluate preset tools through `evaluateAgentPresetToolPolicy` before treating any tool as callable.
- API keys remain runtime-only and are not stored in the preset.

## Supported tool identifiers

- `file-attachments`
- `vision-input`
- `voice-io`
- `model-comparison`
- `http-mcp`
- `stdio-mcp`
- `terminal`
- `code-execution`

The Web form defaults to low-risk local tools and filters out terminal, code-execution, and stdio MCP entries. Higher-risk tools require future explicit security confirmation before execution.
