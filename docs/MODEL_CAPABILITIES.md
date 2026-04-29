# Model Capabilities

P1-M1 adds a lightweight model capability registry.

## Implemented

- Infer capabilities from provider/model names.
- Detect vision, file, tool, reasoning, image-generation, audio, and context-window hints.
- Merge explicit provider metadata over inferred defaults.
- Produce UI gates with user-readable disabled reasons.
- Filter models by task capability.

## Usage

Provider adapters can keep returning conservative metadata, while the client can enrich model cards with `inferModelCapability` until provider-specific metadata is available.
