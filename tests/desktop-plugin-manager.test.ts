import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDesktopStdioMcpServer,
  createPluginManifest,
  createPluginRegistry,
  getPluginPlatformCapabilities,
  inspectPlugin,
  installPlugin,
  setDesktopStdioMcpEnabled,
  setPluginEnabled,
} from '../packages/core/src/tools/plugin-manager.ts';
import { evaluateToolInvocation } from '../packages/core/src/security/security-policy.ts';

const timestamp = '2026-05-02T15:30:00.000Z';

const stdioEnabledSettings = {
  terminalEnabled: false,
  codeExecutionEnabled: false,
  stdioMcpEnabled: true,
  broadFilesystemEnabled: false,
  requireConfirmationForHighRisk: true,
};

test('desktop stdio MCP registration is desktop-only and requires explicit confirmation', () => {
  const registry = createPluginRegistry();
  const draft = {
    id: 'local-docs',
    name: 'Local docs MCP',
    launcherId: 'desktop.mcp.local-docs',
    args: ['--workspace', 'docs', '--api-key', 'runtime-secret'],
    envRefs: ['LOCAL_DOCS_TOKEN', 'invalid name'],
  };

  const denied = createDesktopStdioMcpServer(registry, draft, {
    platform: 'web',
    confirmation: { accepted: true, confirmedAt: timestamp, reason: 'Install local docs MCP' },
    now: () => timestamp,
  });
  const missingConfirmation = createDesktopStdioMcpServer(registry, draft, {
    platform: 'desktop',
    confirmation: { accepted: false, confirmedAt: timestamp, reason: '' },
    now: () => timestamp,
  });
  const registered = createDesktopStdioMcpServer(registry, draft, {
    platform: 'desktop',
    confirmation: { accepted: true, confirmedAt: timestamp, reason: 'Install local docs MCP' },
    now: () => timestamp,
  });

  assert.equal(denied.ok, false);
  assert.match(denied.audit.error ?? '', /desktop/);
  assert.equal(missingConfirmation.ok, false);
  assert.match(missingConfirmation.audit.error ?? '', /confirmation/);
  assert.equal(registered.ok, true);
  assert.equal(registered.server.transport, 'stdio');
  assert.equal(registered.server.platform, 'desktop');
  assert.equal(registered.server.enabled, false);
  assert.deepEqual(registered.server.args, ['--workspace', 'docs']);
  assert.deepEqual(registered.server.envRefs, ['LOCAL_DOCS_TOKEN']);
});

test('desktop stdio MCP cannot be enabled until the stdio capability and confirmation are present', () => {
  const registered = createDesktopStdioMcpServer(createPluginRegistry(), {
    id: 'local-docs',
    name: 'Local docs MCP',
    launcherId: 'desktop.mcp.local-docs',
  }, {
    platform: 'desktop',
    confirmation: { accepted: true, confirmedAt: timestamp, reason: 'Register' },
    now: () => timestamp,
  });
  assert.equal(registered.ok, true);

  const blockedByDefault = setDesktopStdioMcpEnabled(registered.server, true, {
    platform: 'desktop',
    confirmation: { accepted: true, confirmedAt: timestamp, reason: 'Enable' },
    now: () => timestamp,
  });
  const missingConfirmation = setDesktopStdioMcpEnabled(registered.server, true, {
    platform: 'desktop',
    settings: stdioEnabledSettings,
    confirmation: { accepted: false, confirmedAt: timestamp, reason: '' },
    now: () => timestamp,
  });
  const enabled = setDesktopStdioMcpEnabled(registered.server, true, {
    platform: 'desktop',
    settings: stdioEnabledSettings,
    confirmation: { accepted: true, confirmedAt: timestamp, reason: 'Enable local docs MCP' },
    now: () => timestamp,
  });

  assert.equal(blockedByDefault.ok, false);
  assert.match(blockedByDefault.audit.error ?? '', /stdio_mcp/);
  assert.equal(missingConfirmation.ok, false);
  assert.match(missingConfirmation.audit.error ?? '', /confirmation/);
  assert.equal(enabled.ok, true);
  assert.equal(enabled.server.enabled, true);
  assert.equal(enabled.audit.requiresConfirmation, true);
});

test('plugin manifests declare permissions provider requirements and platform support', () => {
  const manifest = createPluginManifest({
    id: 'rag-tools',
    name: 'RAG Tools',
    version: '1.2.0',
    description: 'Search and cite local knowledge',
    platforms: ['desktop', 'web', 'desktop'],
    permissions: ['http_api', 'knowledge_read', 'http_api'],
    providerRequirements: [{ type: 'openai-compatible', features: ['embeddings', 'toolCalls'] }],
    runtime: { type: 'http_mcp', serverId: 'docs' },
  }, timestamp);

  assert.deepEqual(manifest.platforms, ['desktop', 'web']);
  assert.deepEqual(manifest.permissions, ['http_api', 'knowledge_read']);
  assert.deepEqual(manifest.providerRequirements, [{ type: 'openai-compatible', features: ['embeddings', 'toolCalls'] }]);
  assert.equal(manifest.runtime.type, 'http_mcp');
});

test('plugins install inspect enable disable and audit policy decisions immutably', () => {
  const manifest = createPluginManifest({
    id: 'local-docs',
    name: 'Local docs',
    version: '1.0.0',
    platforms: ['desktop'],
    permissions: ['stdio_mcp', 'sensitive'],
    providerRequirements: [{ type: 'any', features: ['toolCalls'] }],
    runtime: { type: 'stdio_mcp', serverId: 'local-docs' },
  }, timestamp);

  const installed = installPlugin(createPluginRegistry(), manifest, {
    platform: 'desktop',
    now: () => timestamp,
  });
  const blockedEnable = setPluginEnabled(installed.registry, 'local-docs', true, {
    platform: 'desktop',
    confirmation: { accepted: true, confirmedAt: timestamp, reason: 'Enable local docs' },
    now: () => timestamp,
  });
  const enabled = setPluginEnabled(installed.registry, 'local-docs', true, {
    platform: 'desktop',
    settings: stdioEnabledSettings,
    confirmation: { accepted: true, confirmedAt: timestamp, reason: 'Enable local docs' },
    now: () => timestamp,
  });
  const disabled = setPluginEnabled(enabled.registry, 'local-docs', false, {
    platform: 'desktop',
    now: () => timestamp,
  });
  const inspected = inspectPlugin(enabled.registry, 'local-docs', {
    platform: 'desktop',
    settings: stdioEnabledSettings,
  });

  assert.equal(installed.ok, true);
  assert.equal(installed.registry.plugins[0]?.enabled, false);
  assert.equal(blockedEnable.ok, false);
  assert.equal(installed.registry.plugins[0]?.enabled, false);
  assert.equal(enabled.ok, true);
  assert.equal(enabled.registry.plugins[0]?.enabled, true);
  assert.equal(disabled.ok, true);
  assert.equal(disabled.registry.plugins[0]?.enabled, false);
  assert.equal(inspected?.policy.allowed, true);
  assert.deepEqual(enabled.audit.arguments, { pluginId: 'local-docs', enabled: true, reason: 'Enable local docs' });
});

test('plugins cannot install or enable unsupported platform and critical execution paths', () => {
  const stdioPlugin = createPluginManifest({
    id: 'desktop-only',
    name: 'Desktop only',
    version: '1.0.0',
    platforms: ['desktop'],
    permissions: ['stdio_mcp'],
    runtime: { type: 'stdio_mcp', serverId: 'desktop-only' },
  }, timestamp);
  const criticalPlugin = createPluginManifest({
    id: 'runner',
    name: 'Runner',
    version: '1.0.0',
    platforms: ['desktop'],
    permissions: ['terminal', 'code_execution'],
    runtime: { type: 'ui_extension', entryPoint: 'runner' },
  }, timestamp);
  const unsafeLauncher = createDesktopStdioMcpServer(createPluginRegistry(), {
    id: 'unsafe',
    name: 'Unsafe',
    launcherId: 'powershell',
  }, {
    platform: 'desktop',
    confirmation: { accepted: true, confirmedAt: timestamp, reason: 'Register' },
    now: () => timestamp,
  });

  const mobileInstall = installPlugin(createPluginRegistry(), stdioPlugin, { platform: 'mobile', now: () => timestamp });
  const criticalInstall = installPlugin(createPluginRegistry(), criticalPlugin, { platform: 'desktop', now: () => timestamp });

  assert.equal(mobileInstall.ok, false);
  assert.match(mobileInstall.audit.error ?? '', /not supported/);
  assert.equal(criticalInstall.ok, false);
  assert.match(criticalInstall.audit.error ?? '', /Critical/);
  assert.equal(unsafeLauncher.ok, false);
  assert.match(unsafeLauncher.audit.error ?? '', /launcher/);
  assert.equal(evaluateToolInvocation(['terminal', 'code_execution'], stdioEnabledSettings).allowed, false);
});

test('plugin platform capabilities keep stdio MCP desktop-only while HTTP MCP stays shared', () => {
  assert.deepEqual(getPluginPlatformCapabilities('web'), {
    platform: 'web',
    httpMcp: true,
    stdioMcpRegistration: false,
    pluginManager: false,
  });
  assert.deepEqual(getPluginPlatformCapabilities('mobile'), {
    platform: 'mobile',
    httpMcp: true,
    stdioMcpRegistration: false,
    pluginManager: false,
  });
  assert.deepEqual(getPluginPlatformCapabilities('desktop'), {
    platform: 'desktop',
    httpMcp: true,
    stdioMcpRegistration: true,
    pluginManager: true,
  });
});
