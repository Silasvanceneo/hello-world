# Usage and Cost Estimation

P2-M4 adds local-first usage and cost estimates. This is not billing and does not charge users.

## Price table

The app ships with a small seed price table for common model name patterns:

- `gpt-4.1-mini`
- `gpt-4.1`
- `gpt-4o-mini`
- `gpt-4o`
- `claude`
- local patterns such as `ollama`, `llama`, and `local-echo`
- fallback `*`

These are estimates only. Prices can change, so this table should be treated as user-facing guidance rather than authoritative billing data.

## Cost calculation

Estimated cost is:

```text
(promptTokens * inputPricePerMillion + completionTokens * outputPricePerMillion) / 1,000,000
```

Usage records are enriched immutably with `estimatedCost` and `currency`.

## Trends and budgets

The core layer can aggregate estimated cost by:

- day
- month

The Web layer stores local budget settings:

- daily limit
- monthly limit
- currency

Budget reminders are local only and use current persisted chat usage. They do not send data to a server and do not perform real billing.
