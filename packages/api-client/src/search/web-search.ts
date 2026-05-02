import type { GroundingSnippet } from '@hello-world/shared';
import { createGroundingSnippets, validateGroundedAnswer } from '@hello-world/core';

export type WebSearchProviderType = 'brave' | 'tavily' | 'bing' | 'searxng' | 'custom';

export type WebSearchProvider = {
  id: string;
  type: WebSearchProviderType;
  name: string;
  baseUrl?: string;
  enabled: boolean;
};

export type WebSearchRequest = {
  query: string;
  maxResults?: number;
  safeSearch?: 'off' | 'moderate' | 'strict';
};

export type WebSearchRuntimeContext = {
  fetch?: typeof fetch;
  apiKey?: string;
  now?: () => string;
};

export type NormalizedSearchResult = {
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string;
  sourceDomain: string;
  score?: number;
  retrievedAt: string;
};

export type WebSearchRun = {
  provider: WebSearchProvider;
  results: NormalizedSearchResult[];
  retrievedAt: string;
};

export type PageFetchContext = {
  platform?: 'web' | 'desktop' | 'mobile';
  fetch?: typeof fetch;
  desktopProxyFetch?: typeof fetch;
  now?: () => string;
};

export type GroundingPage = {
  url: string;
  title: string;
  text: string;
  sourceDomain: string;
  retrievedAt: string;
  viaDesktopProxy: boolean;
};

export type GroundedAnswerRequest = {
  query: string;
  snippets: GroundingSnippet[];
  complete: (messages: Array<{ role: 'system' | 'user'; content: string }>) => Promise<string>;
};

export type GroundedAnswerResult =
  | { ok: true; text: string; citations: GroundingSnippet[] }
  | { ok: false; message: string };

export function createWebSearchProvider(draft: WebSearchProvider): WebSearchProvider {
  return {
    id: normalizeId(draft.id),
    type: draft.type,
    name: draft.name.trim() || draft.type,
    baseUrl: draft.baseUrl ? sanitizeUrl(draft.baseUrl) : undefined,
    enabled: draft.enabled,
  };
}

export async function searchWeb(
  provider: WebSearchProvider,
  request: WebSearchRequest,
  context: WebSearchRuntimeContext = {},
): Promise<WebSearchRun> {
  if (!provider.enabled) {
    return { provider, results: [], retrievedAt: getNow(context)() };
  }
  const fetchImpl = context.fetch ?? fetch;
  const retrievedAt = getNow(context)();
  const response = await fetchImpl(searchEndpoint(provider, request), {
    method: provider.type === 'tavily' ? 'POST' : 'GET',
    headers: searchHeaders(provider, context.apiKey),
    body: provider.type === 'tavily'
      ? JSON.stringify({ query: request.query, max_results: request.maxResults ?? 5, include_answer: false })
      : undefined,
  });
  if (!response.ok) {
    throw new Error(`Search request failed: ${response.status} ${response.statusText}`);
  }
  const body = await response.json();
  return {
    provider: createWebSearchProvider(provider),
    results: normalizeSearchResults(provider.type, extractProviderResults(provider.type, body), retrievedAt),
    retrievedAt,
  };
}

export function normalizeSearchResults(
  providerType: WebSearchProviderType,
  items: Array<Record<string, unknown>>,
  retrievedAt: string,
): NormalizedSearchResult[] {
  return items.map((item) => {
    const url = sanitizeUrl(stringValue(item.url) ?? stringValue(item.link) ?? '');
    return {
      title: stringValue(item.title) ?? stringValue(item.name) ?? url,
      url,
      snippet: stringValue(item.snippet) ?? stringValue(item.description) ?? stringValue(item.content) ?? '',
      publishedAt: stringValue(item.publishedAt)
        ?? stringValue(item.published_date)
        ?? stringValue(item.publishedDate)
        ?? stringValue(item.date)
        ?? stringValue(item.dateLastCrawled)
        ?? stringValue(item.age),
      sourceDomain: sourceDomain(url),
      score: typeof item.score === 'number' ? item.score : undefined,
      retrievedAt,
    };
  }).filter((item) => item.url && item.title && item.snippet)
    .map((item) => providerType === 'bing' ? { ...item, score: item.score } : item);
}

export async function fetchPageForGrounding(url: string, context: PageFetchContext = {}): Promise<GroundingPage> {
  const sanitizedUrl = sanitizeUrl(url);
  const retrievedAt = getNow(context)();
  const primaryFetch = context.fetch ?? fetch;
  let response: Response | undefined;
  let viaDesktopProxy = false;
  try {
    response = await primaryFetch(sanitizedUrl);
  } catch (error) {
    if (!context.desktopProxyFetch) {
      throw error;
    }
  }
  if (!response && context.desktopProxyFetch) {
    response = await context.desktopProxyFetch(sanitizedUrl);
    viaDesktopProxy = true;
  }
  if (!response?.ok) {
    throw new Error(`Page fetch failed: ${response?.status ?? 'network'} ${response?.statusText ?? ''}`.trim());
  }

  const html = await response.text();
  return {
    url: sanitizedUrl,
    title: extractTitle(html) ?? sourceDomain(sanitizedUrl),
    text: htmlToText(html),
    sourceDomain: sourceDomain(sanitizedUrl),
    retrievedAt,
    viaDesktopProxy,
  };
}

export async function generateGroundedAnswer(request: GroundedAnswerRequest): Promise<GroundedAnswerResult> {
  const prompt = `Answer using only the cited sources.\n\n${request.query}\n\n${request.snippets.map((snippet) => `[${snippet.index}] ${snippet.title}\n${snippet.text}`).join('\n\n')}`;
  const text = await request.complete([
    { role: 'system', content: 'Use source citations like [1]. If sources are insufficient, say so.' },
    { role: 'user', content: prompt },
  ]);
  const validation = validateGroundedAnswer(text, request.snippets);
  if (!validation.ok) {
    return { ok: false, message: validation.message };
  }
  return {
    ok: true,
    text,
    citations: createGroundingSnippets(request.snippets.filter((snippet) => text.includes(`[${snippet.index}]`))),
  };
}

function searchEndpoint(provider: WebSearchProvider, request: WebSearchRequest): string {
  const query = request.query.trim();
  const count = String(request.maxResults ?? 5);
  if (provider.type === 'brave') {
    const url = new URL(provider.baseUrl || 'https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', count);
    url.searchParams.set('safesearch', request.safeSearch ?? 'moderate');
    return url.toString();
  }
  if (provider.type === 'tavily') {
    return provider.baseUrl || 'https://api.tavily.com/search';
  }
  if (provider.type === 'bing') {
    const url = new URL(provider.baseUrl || 'https://api.bing.microsoft.com/v7.0/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', count);
    return url.toString();
  }
  if (provider.type === 'searxng') {
    const url = new URL('/search', (provider.baseUrl || 'https://searx.local').replace(/\/$/, '/'));
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    return url.toString();
  }
  const url = new URL(provider.baseUrl || 'https://search.example/search');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', count);
  return sanitizeUrl(url.toString());
}

function searchHeaders(provider: WebSearchProvider, apiKey?: string): Record<string, string> {
  if (!apiKey) {
    return {};
  }
  if (provider.type === 'brave') return { 'x-subscription-token': apiKey };
  if (provider.type === 'bing') return { 'ocp-apim-subscription-key': apiKey };
  if (provider.type === 'tavily') return { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` };
  return {};
}

function extractProviderResults(providerType: WebSearchProviderType, body: unknown): Array<Record<string, unknown>> {
  if (!isRecord(body)) return [];
  if (providerType === 'brave' && isRecord(body.web) && Array.isArray(body.web.results)) return body.web.results.filter(isRecord);
  if (providerType === 'bing' && isRecord(body.webPages) && Array.isArray(body.webPages.value)) return body.webPages.value.filter(isRecord);
  if (Array.isArray(body.results)) return body.results.filter(isRecord);
  return [];
}

function sanitizeUrl(value?: string): string {
  if (!value) return '';
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/token|key|secret|password|authorization|api[_-]?key/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    return url.toString().replace(/\?$/, '');
  } catch {
    return value.trim();
  }
}

function sourceDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function htmlToText(html: string): string {
  return decodeHtml(html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeHtml(match[1].replace(/\s+/g, ' ').trim()) : undefined;
}

function decodeHtml(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#039;', "'")
    .replaceAll('&apos;', "'");
}

function normalizeId(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9:_-]/g, '-').slice(0, 128) || 'search-provider';
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getNow(context: Pick<WebSearchRuntimeContext, 'now'>): () => string {
  return context.now ?? (() => new Date().toISOString());
}
