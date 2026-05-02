export function createRagEvalViewModel(report, { threshold = 0.8 } = {}) {
  const hitRate = normalizeMetric(report?.hitRate);
  const citationAccuracy = normalizeMetric(report?.citationAccuracy);
  const noAnswerAccuracy = normalizeMetric(report?.noAnswerAccuracy);
  return {
    total: report?.total ?? 0,
    hitRate,
    citationAccuracy,
    noAnswerAccuracy,
    hitRateLabel: formatPercent(hitRate),
    citationAccuracyLabel: formatPercent(citationAccuracy),
    noAnswerAccuracyLabel: formatPercent(noAnswerAccuracy),
    passing: hitRate >= threshold && citationAccuracy >= threshold && noAnswerAccuracy >= threshold,
    cases: report?.cases ?? [],
  };
}

export function renderRagEvalReport(report, options = {}) {
  const model = createRagEvalViewModel(report, options);
  const cases = model.cases.map((item) => `<li>
    <strong>${escapeHtml(item.id)}</strong>
    <span>${escapeHtml(item.hit ? 'hit' : 'miss')}</span>
    <span>${escapeHtml(item.citationAccurate ? 'citation ok' : 'citation gap')}</span>
    <small>${escapeHtml(item.topCitationLabels.join(', ') || 'no citations')}</small>
  </li>`).join('');

  return `<section class="rag-eval-report" data-passing="${model.passing}">
    <p>Hit rate ${escapeHtml(model.hitRateLabel)}</p>
    <p>Citation accuracy ${escapeHtml(model.citationAccuracyLabel)}</p>
    <p>No-answer accuracy ${escapeHtml(model.noAnswerAccuracyLabel)}</p>
    <ul>${cases}</ul>
  </section>`;
}

function normalizeMetric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}

function formatPercent(value) {
  return `${(normalizeMetric(value) * 100).toFixed(1)}%`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
