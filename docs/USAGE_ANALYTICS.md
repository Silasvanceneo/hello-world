# Usage Analytics

P0-M7 records token usage from assistant messages and aggregates it locally.

## Implemented

- `UsageRecord`, `UsageSummary`, and `UsageBucket` shared types.
- Collect usage from chat sessions.
- Aggregate by model.
- Aggregate by day.
- Format a readable per-session/total usage label.
- Web usage-dashboard view-model helper.

## Notes

This is local analytics only. It is not billing, credits, invoices, or SaaS metering.
