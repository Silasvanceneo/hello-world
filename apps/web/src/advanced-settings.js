const searchProviderTypes = ['brave', 'tavily', 'bing', 'searxng', 'custom'];
const ragScopes = ['session', 'library', 'session-library'];
const embeddingProviders = ['local', 'remote'];
const indexModes = ['lightweight', 'desktop-durable'];
const retrievalModes = ['lexical', 'vector', 'hybrid'];
const codeLanguages = ['javascript', 'python'];

export function createDefaultAdvancedSettings() {
  return {
    rag: {
      enabled: true,
      sourceScope: 'session-library',
      embeddingProvider: 'local',
      indexMode: 'lightweight',
      retrievalMode: 'hybrid',
      maxChunks: 6,
      requireCitations: true,
      rerankingEnabled: false,
    },
    webSearch: {
      enabled: false,
      providerType: 'searxng',
      providerName: 'SearXNG',
      endpoint: '',
      maxResults: 5,
      groundedAnswers: true,
      desktopProxy: false,
    },
    mcp: {
      httpEnabled: false,
      httpServerName: 'HTTP MCP server',
      httpEndpoint: '',
      httpTools: ['search', 'fetch'],
      pluginManagerEnabled: false,
      stdioMcpEnabled: false,
      requireConfirmation: true,
    },
    codeExecution: {
      enabled: false,
      language: 'javascript',
      timeoutMs: 5000,
      requireConfirmation: true,
    },
  };
}

export function normalizeAdvancedSettings(value = {}) {
  const defaults = createDefaultAdvancedSettings();
  return {
    rag: normalizeRagSettings({ ...defaults.rag, ...(value.rag ?? {}) }),
    webSearch: normalizeWebSearchSettings({ ...defaults.webSearch, ...(value.webSearch ?? {}) }),
    mcp: normalizeMcpSettings({ ...defaults.mcp, ...(value.mcp ?? {}) }),
    codeExecution: normalizeCodeExecutionSettings({ ...defaults.codeExecution, ...(value.codeExecution ?? {}) }),
  };
}

export function mergeAdvancedSettings(current = {}, draft = {}) {
  const normalizedCurrent = normalizeAdvancedSettings(current);
  return normalizeAdvancedSettings({
    rag: { ...normalizedCurrent.rag, ...(draft.rag ?? {}) },
    webSearch: { ...normalizedCurrent.webSearch, ...(draft.webSearch ?? {}) },
    mcp: { ...normalizedCurrent.mcp, ...(draft.mcp ?? {}) },
    codeExecution: { ...normalizedCurrent.codeExecution, ...(draft.codeExecution ?? {}) },
  });
}

export function createAdvancedSettingsViewModel(settings = {}, {
  platform = detectAdvancedPlatform(),
  desktopCapabilities,
} = {}) {
  const normalized = normalizeAdvancedSettings(settings);
  const desktop = platform === 'desktop';
  const capabilityRows = [
    {
      id: 'rag',
      label: 'RAG',
      status: normalized.rag.enabled ? 'configured' : 'disabled',
      detail: `${normalized.rag.sourceScope} / ${normalized.rag.indexMode} / ${normalized.rag.retrievalMode}`,
    },
    {
      id: 'web-search',
      label: 'Web search',
      status: normalized.webSearch.enabled ? 'configured' : 'disabled',
      detail: `${normalized.webSearch.providerName} / ${normalized.webSearch.maxResults} results / grounded ${normalized.webSearch.groundedAnswers ? 'on' : 'off'}`,
    },
    {
      id: 'http-mcp',
      label: 'HTTP MCP',
      status: normalized.mcp.httpEnabled ? 'configured' : 'disabled',
      detail: normalized.mcp.httpEndpoint || 'No endpoint configured',
    },
    {
      id: 'stdio-mcp',
      label: 'stdio MCP',
      status: desktop && normalized.mcp.stdioMcpEnabled ? 'desktop-only' : desktop ? 'available' : 'unavailable',
      detail: desktop ? 'Desktop registration still requires confirmation.' : 'Hidden outside Desktop.',
    },
    {
      id: 'plugins',
      label: 'Plugin manager',
      status: desktop && normalized.mcp.pluginManagerEnabled ? 'configured' : desktop ? 'available' : 'unavailable',
      detail: desktop ? 'Desktop control plane; critical capabilities remain blocked.' : 'Desktop-only.',
    },
    {
      id: 'code-execution',
      label: 'Code execution',
      status: desktop && normalized.codeExecution.enabled ? 'desktop-only' : desktop ? 'available' : 'unavailable',
      detail: desktop
        ? `${normalized.codeExecution.language} / ${normalized.codeExecution.timeoutMs}ms / confirmation required`
        : 'Hidden on Web and Mobile.',
    },
    {
      id: 'terminal',
      label: 'Terminal',
      status: 'blocked',
      detail: 'No arbitrary shell or terminal endpoint is exposed.',
    },
  ];

  if (desktopCapabilities) {
    capabilityRows.push({
      id: 'desktop-native',
      label: 'Desktop native',
      status: desktopCapabilities.ready?.length > 0 ? 'available' : 'unavailable',
      detail: desktopCapabilities.message ?? 'No desktop capability report yet.',
    });
  }

  return {
    platform,
    settings: normalized,
    capabilityRows,
    enabledCount: capabilityRows.filter((row) => ['configured', 'available', 'desktop-only'].includes(row.status)).length,
  };
}

export function renderAdvancedSettingsSummary(input = {}) {
  const model = input.capabilityRows ? input : createAdvancedSettingsViewModel(input.settings, input);
  return `<ul class="security-list capability-list">
    ${model.capabilityRows.map((row) => `<li>
      <div>
        <strong>${escapeHtml(row.label)}</strong>
        <small>${escapeHtml(row.detail)}</small>
      </div>
      <span data-status="${escapeAttribute(row.status)}">${escapeHtml(row.status)}</span>
    </li>`).join('')}
  </ul>`;
}

export function detectAdvancedPlatform(environment = globalThis) {
  if (environment.__TAURI__?.core?.invoke) {
    return 'desktop';
  }
  if (environment.Capacitor?.isNativePlatform?.() || environment.Capacitor?.Plugins?.Camera) {
    return 'mobile';
  }
  return 'web';
}

function normalizeRagSettings(value) {
  return {
    enabled: value.enabled !== false,
    sourceScope: oneOf(value.sourceScope, ragScopes, 'session-library'),
    embeddingProvider: oneOf(value.embeddingProvider, embeddingProviders, 'local'),
    indexMode: oneOf(value.indexMode, indexModes, 'lightweight'),
    retrievalMode: oneOf(value.retrievalMode, retrievalModes, 'hybrid'),
    maxChunks: clampInteger(value.maxChunks, 1, 20, 6),
    requireCitations: value.requireCitations !== false,
    rerankingEnabled: Boolean(value.rerankingEnabled),
  };
}

function normalizeWebSearchSettings(value) {
  const providerType = oneOf(value.providerType, searchProviderTypes, 'searxng');
  return {
    enabled: Boolean(value.enabled),
    providerType,
    providerName: normalizeText(value.providerName, defaultSearchProviderName(providerType), 80),
    endpoint: sanitizeEndpoint(value.endpoint),
    maxResults: clampInteger(value.maxResults, 1, 20, 5),
    groundedAnswers: value.groundedAnswers !== false,
    desktopProxy: Boolean(value.desktopProxy),
  };
}

function normalizeMcpSettings(value) {
  return {
    httpEnabled: Boolean(value.httpEnabled),
    httpServerName: normalizeText(value.httpServerName, 'HTTP MCP server', 80),
    httpEndpoint: sanitizeEndpoint(value.httpEndpoint),
    httpTools: normalizeToolList(value.httpTools),
    pluginManagerEnabled: Boolean(value.pluginManagerEnabled),
    stdioMcpEnabled: Boolean(value.stdioMcpEnabled),
    requireConfirmation: true,
  };
}

function normalizeCodeExecutionSettings(value) {
  return {
    enabled: Boolean(value.enabled),
    language: oneOf(value.language, codeLanguages, 'javascript'),
    timeoutMs: clampInteger(value.timeoutMs, 500, 10000, 5000),
    requireConfirmation: true,
  };
}

function normalizeToolList(value) {
  const raw = Array.isArray(value) ? value : String(value ?? '').split(',');
  const tools = raw.reduce((items, item) => {
    const trimmed = item.trim().replace(/[^A-Za-z0-9:_-]/g, '-').replace(/-+/g, '-').slice(0, 64);
    return trimmed && !items.includes(trimmed) ? [...items, trimmed] : items;
  }, []);
  return tools.length > 0 ? tools.slice(0, 20) : ['search', 'fetch'];
}

function sanitizeEndpoint(value) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return '';
  }
  try {
    const url = new URL(raw);
    url.username = '';
    url.password = '';
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/token|key|secret|password|authorization/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    return url.toString().replace(/\?$/, '');
  } catch {
    return raw.replace(/\s+/g, '').slice(0, 240);
  }
}

function normalizeText(value, fallback, maxLength) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  return (text || fallback).slice(0, maxLength);
}

function defaultSearchProviderName(providerType) {
  const labels = {
    brave: 'Brave Search',
    tavily: 'Tavily',
    bing: 'Bing Search',
    searxng: 'SearXNG',
    custom: 'Custom search',
  };
  return labels[providerType] ?? 'Search provider';
}

function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
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
