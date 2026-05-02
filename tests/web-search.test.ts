import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createWebSearchProvider,
  fetchPageForGrounding,
  generateGroundedAnswer,
  normalizeSearchResults,
  searchWeb,
} from '../packages/api-client/src/search/web-search.ts';
import {
  buildGroundedAnswerPrompt,
  createGroundingSnippets,
  validateGroundedAnswer,
} from '../packages/core/src/search/grounded-answer.ts';

const retrievedAt = '2026-05-02T16:30:00.000Z';

test('web search providers normalize Brave Tavily Bing SearXNG and custom results', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetch = async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const value = String(url);
    if (value.includes('api.search.brave.com')) {
      return jsonResponse({ web: { results: [{ title: 'Brave title', url: 'https://example.com/a?token=secret', description: 'Brave snippet', age: '2026-05-01' }] } });
    }
    if (value.includes('api.tavily.com')) {
      return jsonResponse({ results: [{ title: 'Tavily title', url: 'https://docs.example/tavily', content: 'Tavily snippet', score: 0.7, published_date: '2026-04-30' }] });
    }
    if (value.includes('api.bing.microsoft.com')) {
      return jsonResponse({ webPages: { value: [{ name: 'Bing title', url: 'https://learn.example/bing', snippet: 'Bing snippet', dateLastCrawled: '2026-04-29T00:00:00Z' }] } });
    }
    if (value.includes('searx.example')) {
      return jsonResponse({ results: [{ title: 'SearXNG title', url: 'https://searx.example/result', content: 'SearXNG snippet', publishedDate: '2026-04-28' }] });
    }
    return jsonResponse({ results: [{ title: 'Custom title', url: 'https://custom.example/result', snippet: 'Custom snippet', date: '2026-04-27', score: 0.9 }] });
  };

  const providers = [
    createWebSearchProvider({ id: 'brave', type: 'brave', name: 'Brave', enabled: true }),
    createWebSearchProvider({ id: 'tavily', type: 'tavily', name: 'Tavily', enabled: true }),
    createWebSearchProvider({ id: 'bing', type: 'bing', name: 'Bing', enabled: true }),
    createWebSearchProvider({ id: 'searx', type: 'searxng', name: 'SearXNG', baseUrl: 'https://searx.example', enabled: true }),
    createWebSearchProvider({ id: 'custom', type: 'custom', name: 'Custom', baseUrl: 'https://custom.example/search?apiKey=secret', enabled: true }),
  ] as const;
  const results = await Promise.all(providers.map((provider) => searchWeb(provider, { query: 'rag citations', maxResults: 2 }, {
    fetch,
    apiKey: 'runtime-secret',
    now: () => retrievedAt,
  })));

  assert.deepEqual(results.map((item) => item.results[0]?.title), ['Brave title', 'Tavily title', 'Bing title', 'SearXNG title', 'Custom title']);
  assert.equal(results[0].results[0]?.sourceDomain, 'example.com');
  assert.equal(results[0].results[0]?.url, 'https://example.com/a');
  assert.equal(results[4].provider.baseUrl, 'https://custom.example/search');
  assert.equal(String(calls[0]?.init?.headers).includes('runtime-secret'), false);
  assert.deepEqual(Object.keys(calls[0]?.init?.headers as Record<string, string>), ['x-subscription-token']);
});

test('search result normalization strips URL secrets and preserves retrieval dates', () => {
  const normalized = normalizeSearchResults('brave', [
    { title: 'Unsafe', url: 'https://example.com/path?key=secret&keep=ok#frag', snippet: 'snippet', publishedAt: '2026-05-01', score: 0.5 },
  ], retrievedAt);

  assert.equal(normalized[0]?.url, 'https://example.com/path?keep=ok');
  assert.equal(normalized[0]?.sourceDomain, 'example.com');
  assert.equal(normalized[0]?.retrievedAt, retrievedAt);
});

test('page fetch extracts citation-ready snippets and uses desktop proxy when browser fetch is unavailable', async () => {
  const fetched = await fetchPageForGrounding('https://example.com/post?token=secret', {
    platform: 'web',
    fetch: async () => { throw new TypeError('Failed to fetch'); },
    desktopProxyFetch: async (url) => {
      assert.equal(url, 'https://example.com/post');
      return new Response('<html><head><title>Proxy page</title><script>bad()</script></head><body><article>Grounded search content with citations.</article></body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    },
    now: () => retrievedAt,
  });

  assert.equal(fetched.viaDesktopProxy, true);
  assert.equal(fetched.url, 'https://example.com/post');
  assert.equal(fetched.title, 'Proxy page');
  assert.match(fetched.text, /Grounded search content/);
  assert.doesNotMatch(fetched.text, /script/);
});

test('grounded answer prompt requires citations and validates retrieval dates', async () => {
  const snippets = createGroundingSnippets([
    { title: 'Doc A', url: 'https://example.com/a', text: 'Alpha source supports the answer.', retrievedAt, sourceDomain: 'example.com', viaDesktopProxy: false },
    { title: 'Doc B', url: 'https://example.com/b', text: 'Beta source adds another detail.', retrievedAt, sourceDomain: 'example.com', viaDesktopProxy: true },
  ], { maxSnippets: 2, maxCharacters: 80 });
  const prompt = buildGroundedAnswerPrompt('What is supported?', snippets);

  assert.match(prompt, /\[1\]/);
  assert.match(prompt, /Retrieved 2026-05-02T16:30:00.000Z/);
  assert.deepEqual(validateGroundedAnswer('Answer with [1] and [2].', snippets), { ok: true });
  assert.deepEqual(validateGroundedAnswer('Answer without references.', snippets), {
    ok: false,
    message: 'Grounded answers require at least one source citation.',
  });

  const generated = await generateGroundedAnswer({
    query: 'What is supported?',
    snippets,
    complete: async (messages) => {
      assert.match(messages[messages.length - 1]?.content ?? '', /\[1\]/);
      return 'Alpha and beta are supported. [1] [2]';
    },
  });

  assert.equal(generated.ok, true);
  assert.equal(generated.citations.length, 2);
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
