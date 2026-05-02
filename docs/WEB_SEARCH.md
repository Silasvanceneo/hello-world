# Web Search and Grounded Answers

P8-M1 adds Web search provider normalization and grounded answer validation.

## Providers

Supported provider types:

- Brave Search
- Tavily
- Bing Web Search
- SearXNG
- custom OpenAI-style relay or internal search endpoint

Provider credentials are runtime-only inputs to the search call. Search provider metadata may store provider id, type, name, base URL, and enabled state, but not API keys.

## Normalization

Search results normalize to:

- title
- sanitized URL
- snippet
- optional published date
- source domain
- optional score
- retrieval timestamp

URLs are stripped of credentials, hash fragments, and query parameters that look like tokens, keys, secrets, passwords, or authorization values.

## Page Extraction

`fetchPageForGrounding` extracts citation-ready text from HTML by removing scripts, styles, tags, and excess whitespace.

Web and Mobile use direct browser fetch where CORS allows it. Desktop can provide a proxy fetch implementation for pages that cannot be fetched directly, and snippets mark `viaDesktopProxy` for auditability.

## Grounded Answers

Grounded answer prompts require source blocks with retrieval timestamps and citation ids such as `[1]`.

Validation rejects answers that do not cite at least one supplied source. Bing-backed result presentation should preserve source attribution and avoid presenting synthesized output as uncited Bing content.
