# Quality Review

Last review: 2026-04-29

## Gate status

- Result: passing.
- Verification command: `npm run check`.
- Automated coverage in `npm run check`:
  - scaffold/path integrity check
  - unit/integration-style Node tests
  - static Web build
  - repository review gate for file-size and suspicious committed secrets

## Review findings

- Source files are currently below the 800-line maximum used by the project review gate.
- Local secret handling follows the current design: provider keys are runtime-only in the browser tab, with persisted state storing provider metadata and `apiKeyRef` only.
- The only credential-like literals detected are dummy test fixtures such as `runtime-key` and `runtime-secret`.
- Web UI uses escaped message/session/attachment content before injecting generated markup.
- Native Desktop/Android builds remain blocked until Tauri/Capacitor and platform toolchains are installed.

## Continue criteria

Continue feature work only when `npm run check` passes. If the review gate reports a possible secret, treat it as blocking until it is removed or proven to be an explicit dummy fixture in tests.
