import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAdvancedSettingsViewModel,
  createDefaultAdvancedSettings,
  detectAdvancedPlatform,
  mergeAdvancedSettings,
  normalizeAdvancedSettings,
  renderAdvancedSettingsSummary,
} from '../apps/web/src/advanced-settings.js';
import {
  createInitialWebState,
  parseState,
  saveAdvancedSettings,
  serializeState,
} from '../apps/web/src/web-state.js';

test('advanced settings normalize RAG search MCP and code execution safely', () => {
  const settings = normalizeAdvancedSettings({
    rag: {
      sourceScope: 'unknown',
      embeddingProvider: 'remote',
      indexMode: 'desktop-durable',
      retrievalMode: 'hybrid',
      maxChunks: '99',
    },
    webSearch: {
      enabled: true,
      providerType: 'custom',
      providerName: ' Internal Search ',
      endpoint: 'https://search.example.test?q=ok&apiKey=secret#frag',
      maxResults: '8',
      desktopProxy: true,
    },
    mcp: {
      httpEnabled: true,
      httpEndpoint: 'https://mcp.example.test/rpc?token=secret&workspace=main',
      httpTools: 'search, fetch, bad tool, search',
      pluginManagerEnabled: true,
      stdioMcpEnabled: true,
      requireConfirmation: false,
    },
    codeExecution: {
      enabled: true,
      language: 'ruby',
      timeoutMs: '12000',
    },
  });

  assert.equal(settings.rag.sourceScope, 'session-library');
  assert.equal(settings.rag.maxChunks, 20);
  assert.equal(settings.webSearch.endpoint, 'https://search.example.test/?q=ok');
  assert.deepEqual(settings.mcp.httpTools, ['search', 'fetch', 'bad-tool']);
  assert.equal(settings.mcp.requireConfirmation, true);
  assert.equal(settings.codeExecution.language, 'javascript');
  assert.equal(settings.codeExecution.timeoutMs, 10000);
});

test('advanced settings persist through web state without saving runtime secrets', () => {
  let state = createInitialWebState('2026-05-02T20:00:00.000Z');
  state = saveAdvancedSettings(state, {
    webSearch: {
      enabled: true,
      providerType: 'brave',
      providerName: 'Brave',
      endpoint: 'https://api.search.brave.com/res/v1/web/search?key=secret',
      maxResults: 3,
    },
    codeExecution: {
      enabled: true,
      language: 'python',
      timeoutMs: 2500,
    },
  }, '2026-05-02T20:01:00.000Z');
  const restored = parseState(serializeState(state));

  assert.equal(restored.advancedSettings.webSearch.enabled, true);
  assert.equal(restored.advancedSettings.webSearch.endpoint, 'https://api.search.brave.com/res/v1/web/search');
  assert.equal(restored.advancedSettings.codeExecution.language, 'python');
  assert.equal(JSON.stringify(restored).includes('secret'), false);
});

test('advanced settings view model exposes platform-specific capabilities', () => {
  const settings = mergeAdvancedSettings(createDefaultAdvancedSettings(), {
    mcp: { httpEnabled: true, pluginManagerEnabled: true, stdioMcpEnabled: true },
    codeExecution: { enabled: true, language: 'python' },
  });
  const web = createAdvancedSettingsViewModel(settings, { platform: 'web' });
  const desktop = createAdvancedSettingsViewModel(settings, {
    platform: 'desktop',
    desktopCapabilities: { ready: [{ id: 'keychain' }], message: '1 available, 0 deferred desktop integrations.' },
  });

  assert.equal(web.capabilityRows.find((row) => row.id === 'code-execution')?.status, 'unavailable');
  assert.equal(web.capabilityRows.find((row) => row.id === 'stdio-mcp')?.status, 'unavailable');
  assert.equal(desktop.capabilityRows.find((row) => row.id === 'code-execution')?.status, 'desktop-only');
  assert.equal(desktop.capabilityRows.find((row) => row.id === 'stdio-mcp')?.status, 'desktop-only');
  assert.equal(desktop.capabilityRows.some((row) => row.id === 'terminal' && row.status === 'blocked'), true);
});

test('advanced settings renderer escapes capability details', () => {
  const html = renderAdvancedSettingsSummary({
    capabilityRows: [
      { id: 'x', label: '<RAG>', status: 'configured', detail: '<script>bad()</script>' },
    ],
  });

  assert.match(html, /&lt;RAG&gt;/);
  assert.match(html, /&lt;script&gt;bad\(\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test('advanced platform detection distinguishes desktop mobile and web', () => {
  assert.equal(detectAdvancedPlatform({ __TAURI__: { core: { invoke() {} } } }), 'desktop');
  assert.equal(detectAdvancedPlatform({ Capacitor: { isNativePlatform: () => true } }), 'mobile');
  assert.equal(detectAdvancedPlatform({}), 'web');
});
