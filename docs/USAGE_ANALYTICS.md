# Usage Analytics

P0-M7 records token usage from assistant messages and aggregates it locally.

## Implemented

- `UsageRecord`, `UsageSummary`, and `UsageBucket` shared types.
- Collect usage from chat sessions.
- Aggregate by model.
- Aggregate by day.
- Format a readable per-session/total usage label.
- Web usage-dashboard view-model helper.
- Preserve provider usage chunks from supported chat streams.
- Fall back to local token estimates when providers do not return usage.
- Show usage metadata in assistant message bubbles, the topbar summary, and the Cost panel.
- Attach generated-image usage metadata when the image endpoint returns token details.

## Notes

This is local analytics only. It is not billing, credits, invoices, or SaaS metering.
