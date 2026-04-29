# Multi-model Comparison

P1-M2 adds a comparison path for running the same prompt against multiple saved providers or models.

## Flow

1. User writes a prompt.
2. The app sends the prompt plus current chat context to each enabled provider candidate.
3. Each result records:
   - provider/model label
   - response text
   - duration in milliseconds
   - token usage when available, or a local estimate in the Web runtime
   - provider error details when a candidate fails
4. User chooses one successful answer and saves it back to the active chat as the main branch.

## Core behavior

- `compareModels` in `packages/core/src/model/model-comparison.ts` runs candidates independently so one provider failure does not fail the whole comparison run.
- `saveComparisonSelection` appends the original prompt and selected assistant response to the active session immutably.

## Web MVP behavior

- The Web shell compares all enabled saved providers with their configured default model.
- Runtime API keys remain in the in-memory `providerSecrets` map and are not serialized to local storage.
- Comparison cards escape provider text before rendering and only allow saving successful non-empty answers.
