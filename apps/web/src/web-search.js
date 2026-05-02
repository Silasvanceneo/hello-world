export function createGroundedSearchViewModel({ providers = [], searchReport, platform = detectPlatform() } = {}) {
  const providerRuns = searchReport?.providerRuns ?? [];
  const snippets = searchReport?.snippets ?? [];
  const answer = searchReport?.answer;
  const resultCount = providerRuns.reduce((count, run) => count + (run.results?.length ?? 0), 0);
  return {
    platform,
    providers,
    enabledProviders: providers.filter((provider) => provider.enabled).length,
    resultCount,
    citationCount: answer?.ok ? answer.citations.length : 0,
    snippets,
    answerStatus: answer?.ok ? 'grounded' : answer ? 'missing-citations' : 'not-run',
    desktopProxyStatus: platform === 'desktop'
      ? 'available'
      : snippets.some((snippet) => snippet.viaDesktopProxy) ? 'used' : 'unavailable',
    retrievedAt: searchReport?.retrievedAt,
  };
}

export function renderGroundedSearchPanel(input = {}) {
  const model = createGroundedSearchViewModel(input);
  const providerItems = model.providers.map((provider) => `<li>
    <strong>${escapeHtml(provider.name)}</strong>
    <span>${escapeHtml(provider.type)}</span>
    <small>${escapeHtml(provider.enabled ? 'enabled' : 'disabled')}</small>
  </li>`).join('');
  const resultItems = (input.searchReport?.providerRuns ?? []).flatMap((run) => (run.results ?? []).map((result) => `<li>
    <strong>${escapeHtml(result.title)}</strong>
    <a href="${escapeAttribute(result.url)}" rel="noreferrer">${escapeHtml(result.sourceDomain)}</a>
    <small>${escapeHtml(result.snippet)}</small>
  </li>`)).join('');
  const answer = input.searchReport?.answer;
  const answerHtml = answer?.ok
    ? `<p>${escapeHtml(answer.text)}</p>`
    : `<p>${escapeHtml(answer?.message ?? 'No grounded answer yet.')}</p>`;

  return `<section class="grounded-search" data-platform="${escapeHtml(model.platform)}" data-answer-status="${escapeHtml(model.answerStatus)}">
    <header>
      <p>${escapeHtml(model.enabledProviders)} enabled provider(s)</p>
      <p>${escapeHtml(model.resultCount)} result(s)</p>
      <p>${escapeHtml(model.citationCount)} citation(s)</p>
      <p>${escapeHtml(model.desktopProxyStatus)}</p>
    </header>
    <ol class="search-providers">${providerItems}</ol>
    <ol class="search-results">${resultItems}</ol>
    <article>${answerHtml}</article>
  </section>`;
}

function detectPlatform() {
  if (globalThis.__TAURI__?.core?.invoke) return 'desktop';
  if (globalThis.Capacitor?.isNativePlatform?.() || globalThis.Capacitor?.Plugins?.Camera) return 'mobile';
  return 'web';
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('`', '&#096;');
}
