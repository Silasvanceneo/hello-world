const sourceOrder = ['text', 'markdown', 'pdf', 'docx', 'xlsx', 'html', 'url', 'sitemap', 'directory'];
const sharedSources = sourceOrder.filter((source) => source !== 'directory');

export function createKnowledgeIngestionViewModel(state, platform = detectPlatform(), { t = defaultT } = {}) {
  const jobs = state?.ingestion?.jobs ?? [];
  const statusCounts = jobs.reduce((counts, job) => ({
    ...counts,
    [job.status]: (counts[job.status] ?? 0) + 1,
  }), {});
  const supportedSources = platform === 'desktop' ? sourceOrder : sharedSources;
  const failedJobs = statusCounts.failed ?? 0;
  const skippedJobs = statusCounts.skipped ?? 0;
  const activeJobs = jobs.length - failedJobs - skippedJobs;

  return {
    platform,
    totalJobs: jobs.length,
    activeJobs,
    failedJobs,
    skippedJobs,
    statusCounts,
    supportedSources,
    directoryImport: platform === 'desktop' ? 'supported' : 'unsupported',
    summary: t('knowledge.summary', { count: jobs.length }),
    failedSummary: t('knowledge.failed', { count: failedJobs }),
  };
}

export function renderKnowledgeIngestionStatus(state, platform = detectPlatform(), options = {}) {
  const model = createKnowledgeIngestionViewModel(state, platform, options);
  const jobs = state?.ingestion?.jobs ?? [];
  const items = jobs.slice(0, 6).map((job) => `<li>
    <strong>${escapeHtml(job.status)}</strong>
    <span>${escapeHtml(job.sourceId)}</span>
    <small>${escapeHtml(job.error ?? job.duplicateOf ?? `${job.attempts} attempt(s)`)}</small>
  </li>`).join('');

  return `<section class="knowledge-ingestion-status" data-platform="${escapeHtml(model.platform)}">
    <p>${escapeHtml(model.summary)}</p>
    <p>${escapeHtml(model.failedSummary)}</p>
    <p>${escapeHtml(model.supportedSources.join(', '))}</p>
    <p>${escapeHtml(model.directoryImport)}</p>
    <ul>${items}</ul>
  </section>`;
}

function detectPlatform() {
  if (globalThis.__TAURI__?.core?.invoke) return 'desktop';
  if (globalThis.Capacitor?.isNativePlatform?.() || globalThis.Capacitor?.Plugins?.Camera) return 'mobile';
  return 'web';
}

function defaultT(key, values = {}) {
  const defaults = {
    'knowledge.summary': '{count} ingestion jobs tracked.',
    'knowledge.failed': '{count} failed jobs.',
  };
  const template = defaults[key] ?? key;
  return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), template);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
