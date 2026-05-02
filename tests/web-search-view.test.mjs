import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createGroundedSearchViewModel,
  renderGroundedSearchPanel,
} from '../apps/web/src/web-search.js';

const retrievedAt = '2026-05-02T16:30:00.000Z';

test('grounded search view model summarizes providers results citations and platform proxy status', () => {
  const model = createGroundedSearchViewModel({
    providers: [
      { id: 'brave', type: 'brave', name: 'Brave', enabled: true },
      { id: 'searx', type: 'searxng', name: 'SearXNG', enabled: false },
    ],
    searchReport: {
      query: 'rag',
      retrievedAt,
      providerRuns: [
        { provider: { id: 'brave', type: 'brave', name: 'Brave', enabled: true }, results: [{ title: 'Doc', url: 'https://example.com', snippet: 'Snippet', sourceDomain: 'example.com', retrievedAt }] },
      ],
      snippets: [
        { index: 1, title: 'Doc', url: 'https://example.com', text: 'Snippet', retrievedAt, sourceDomain: 'example.com', viaDesktopProxy: true },
      ],
      answer: { ok: true, text: 'Answer [1]', citations: [{ index: 1, title: 'Doc', url: 'https://example.com', retrievedAt, sourceDomain: 'example.com' }] },
    },
    platform: 'desktop',
  });

  assert.equal(model.enabledProviders, 1);
  assert.equal(model.resultCount, 1);
  assert.equal(model.citationCount, 1);
  assert.equal(model.desktopProxyStatus, 'available');
  assert.equal(model.answerStatus, 'grounded');
});

test('grounded search renderer escapes result and answer content', () => {
  const html = renderGroundedSearchPanel({
    providers: [{ id: 'custom', type: 'custom', name: '<Custom>', enabled: true }],
    searchReport: {
      query: '<script>',
      retrievedAt,
      providerRuns: [
        { provider: { id: 'custom', type: 'custom', name: '<Custom>', enabled: true }, results: [{ title: '<Title>', url: 'https://example.com?q=<bad>', snippet: '<snippet>', sourceDomain: 'example.com', retrievedAt }] },
      ],
      snippets: [],
      answer: { ok: false, message: '<missing citation>' },
    },
    platform: 'web',
  });

  assert.match(html, /&lt;Custom&gt;/);
  assert.match(html, /&lt;Title&gt;/);
  assert.match(html, /&lt;missing citation&gt;/);
  assert.doesNotMatch(html, /<script>/);
});
