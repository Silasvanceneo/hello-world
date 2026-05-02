import type { ProviderFeatureSupport, ProviderType, SecuritySettings, ToolCapability, ToolInvocationPolicy } from '@hello-world/shared';
import { classifyToolRisk, defaultSecuritySettings, evaluateToolInvocation, redactSensitiveObject } from '../security/security-policy.ts';
import type { McpAuditRecord, McpAuditStatus, McpPlatform } from './http-mcp.ts';

export type PluginPlatform = McpPlatform;

export type PluginRuntime =
  | { type: 'http_mcp'; serverId: string }
  | { type: 'stdio_mcp'; serverId: string }
  | { type: 'ui_extension'; entryPoint: string };

export type PluginProviderRequirement = {
  type: ProviderType | 'any';
  features: ProviderFeatureSupport[];
};

export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  description?: string;
  platforms: PluginPlatform[];
  permissions: ToolCapability[];
  providerRequirements: PluginProviderRequirement[];
  runtime: PluginRuntime;
  createdAt: string;
  updatedAt: string;
};

export type InstalledPlugin = {
  manifest: PluginManifest;
  enabled: boolean;
  installedAt: string;
  updatedAt: string;
};

export type DesktopStdioMcpServer = {
  id: string;
  name: string;
  enabled: boolean;
  transport: 'stdio';
  platform: 'desktop';
  launcherId: string;
  args: string[];
  envRefs: string[];
  confirmation: PluginConfirmation;
  createdAt: string;
  updatedAt: string;
};

export type PluginRegistry = {
  plugins: InstalledPlugin[];
  stdioServers: DesktopStdioMcpServer[];
};

export type PluginConfirmation = {
  accepted: boolean;
  confirmedAt: string;
  reason: string;
};

export type PluginOperationContext = {
  platform: PluginPlatform;
  settings?: SecuritySettings;
  confirmation?: PluginConfirmation;
  now?: () => string;
  createId?: () => string;
};

export type StdioMcpDraft = {
  id: string;
  name: string;
  launcherId: string;
  args?: string[];
  envRefs?: string[];
};

export type PluginOperationResult<T> =
  | ({ ok: true; audit: McpAuditRecord } & T)
  | { ok: false; audit: McpAuditRecord };

export type PluginInspection = {
  plugin: InstalledPlugin;
  supportedOnPlatform: boolean;
  policy: ToolInvocationPolicy;
};

const dangerousLauncherIds = new Set([
  'bash',
  'cmd',
  'cmd.exe',
  'command',
  'node',
  'node.exe',
  'powershell',
  'powershell.exe',
  'pwsh',
  'pwsh.exe',
  'python',
  'python.exe',
  'python3',
  'sh',
  'terminal',
]);

export function createPluginRegistry(): PluginRegistry {
  return { plugins: [], stdioServers: [] };
}

export function createPluginManifest(
  draft: Omit<PluginManifest, 'createdAt' | 'updatedAt'>,
  timestamp = new Date().toISOString(),
): PluginManifest {
  return {
    id: normalizeIdentifier(draft.id, 'plugin'),
    name: draft.name.trim() || 'Untitled plugin',
    version: draft.version.trim() || '0.0.0',
    description: draft.description?.trim() || undefined,
    platforms: uniquePlatforms(draft.platforms),
    permissions: uniqueCapabilities(draft.permissions),
    providerRequirements: normalizeProviderRequirements(draft.providerRequirements ?? []),
    runtime: normalizePluginRuntime(draft.runtime),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createDesktopStdioMcpServer(
  registry: PluginRegistry,
  draft: StdioMcpDraft,
  context: PluginOperationContext,
): PluginOperationResult<{ registry: PluginRegistry; server: DesktopStdioMcpServer }> {
  const now = getNow(context);
  if (context.platform !== 'desktop') {
    return pluginBlockedAudit('stdio-mcp', 'register_stdio_mcp', { serverId: draft.id }, 'stdio MCP registration is desktop-only.', context);
  }
  if (!hasAcceptedConfirmation(context.confirmation)) {
    return pluginBlockedAudit('stdio-mcp', 'register_stdio_mcp', { serverId: draft.id }, 'Explicit confirmation is required before registering stdio MCP.', context);
  }
  const launcherId = normalizeLauncherId(draft.launcherId);
  if (!launcherId) {
    return pluginBlockedAudit('stdio-mcp', 'register_stdio_mcp', { serverId: draft.id, launcherId: draft.launcherId }, 'Unsupported stdio MCP launcher id.', context);
  }

  const timestamp = now();
  const server: DesktopStdioMcpServer = {
    id: normalizeIdentifier(draft.id, 'stdio-server'),
    name: draft.name.trim() || 'Desktop stdio MCP',
    enabled: false,
    transport: 'stdio',
    platform: 'desktop',
    launcherId,
    args: sanitizeArgs(draft.args ?? []),
    envRefs: sanitizeEnvRefs(draft.envRefs ?? []),
    confirmation: context.confirmation,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const registryWithServer = {
    ...registry,
    stdioServers: registry.stdioServers.some((item) => item.id === server.id)
      ? registry.stdioServers.map((item) => item.id === server.id ? server : item)
      : [server, ...registry.stdioServers],
  };
  return {
    ok: true,
    registry: registryWithServer,
    server,
    audit: createPluginAuditRecord({
      operation: 'register_stdio_mcp',
      subjectId: server.id,
      status: 'success',
      args: { serverId: server.id, launcherId: server.launcherId, envRefs: server.envRefs },
      policy: evaluateToolInvocation(['stdio_mcp'], context.settings ?? defaultSecuritySettings),
      context,
    }),
  };
}

export function setDesktopStdioMcpEnabled(
  server: DesktopStdioMcpServer,
  enabled: boolean,
  context: PluginOperationContext,
): PluginOperationResult<{ server: DesktopStdioMcpServer }> {
  if (context.platform !== 'desktop') {
    return pluginBlockedAudit(server.id, 'set_stdio_mcp_enabled', { serverId: server.id, enabled }, 'stdio MCP is desktop-only.', context);
  }
  const policy = evaluateToolInvocation(['stdio_mcp'], context.settings ?? defaultSecuritySettings);
  if (enabled && !policy.allowed) {
    return pluginBlockedAudit(server.id, 'set_stdio_mcp_enabled', { serverId: server.id, enabled }, policy.reason, context, policy);
  }
  if (enabled && !hasAcceptedConfirmation(context.confirmation)) {
    return pluginBlockedAudit(server.id, 'set_stdio_mcp_enabled', { serverId: server.id, enabled }, 'Explicit confirmation is required before enabling stdio MCP.', context, policy);
  }
  const updatedServer = { ...server, enabled, updatedAt: getNow(context)() };
  return {
    ok: true,
    server: updatedServer,
    audit: createPluginAuditRecord({
      operation: 'set_stdio_mcp_enabled',
      subjectId: server.id,
      status: 'success',
      args: { serverId: server.id, enabled, reason: context.confirmation?.reason },
      policy,
      context,
    }),
  };
}

export function installPlugin(
  registry: PluginRegistry,
  manifest: PluginManifest,
  context: PluginOperationContext,
): PluginOperationResult<{ registry: PluginRegistry; plugin: InstalledPlugin }> {
  const policy = evaluateToolInvocation(manifest.permissions, context.settings ?? defaultSecuritySettings);
  const risk = classifyToolRisk(manifest.permissions);
  if (!manifest.platforms.includes(context.platform)) {
    return pluginBlockedAudit(manifest.id, 'install_plugin', { pluginId: manifest.id }, `Plugin is not supported on ${context.platform}.`, context, policy);
  }
  if (risk === 'critical') {
    return pluginBlockedAudit(manifest.id, 'install_plugin', { pluginId: manifest.id }, 'Critical plugin capabilities are blocked.', context, policy);
  }

  const timestamp = getNow(context)();
  const plugin: InstalledPlugin = {
    manifest,
    enabled: false,
    installedAt: timestamp,
    updatedAt: timestamp,
  };
  const nextRegistry = {
    ...registry,
    plugins: registry.plugins.some((item) => item.manifest.id === manifest.id)
      ? registry.plugins.map((item) => item.manifest.id === manifest.id ? plugin : item)
      : [plugin, ...registry.plugins],
  };
  return {
    ok: true,
    registry: nextRegistry,
    plugin,
    audit: createPluginAuditRecord({
      operation: 'install_plugin',
      subjectId: manifest.id,
      status: 'success',
      args: { pluginId: manifest.id, runtime: manifest.runtime.type, permissions: manifest.permissions },
      policy,
      context,
    }),
  };
}

export function setPluginEnabled(
  registry: PluginRegistry,
  pluginId: string,
  enabled: boolean,
  context: PluginOperationContext,
): PluginOperationResult<{ registry: PluginRegistry; plugin: InstalledPlugin }> {
  const plugin = registry.plugins.find((item) => item.manifest.id === pluginId);
  if (!plugin) {
    return pluginBlockedAudit(pluginId, 'set_plugin_enabled', { pluginId, enabled }, `Plugin is not installed: ${pluginId}`, context);
  }
  const inspection = inspectPlugin(registry, pluginId, context);
  if (!inspection?.supportedOnPlatform) {
    return pluginBlockedAudit(pluginId, 'set_plugin_enabled', { pluginId, enabled }, `Plugin is not supported on ${context.platform}.`, context, inspection?.policy);
  }
  if (enabled && !inspection.policy.allowed) {
    return pluginBlockedAudit(pluginId, 'set_plugin_enabled', { pluginId, enabled }, inspection.policy.reason, context, inspection.policy);
  }
  if (enabled && inspection.policy.requiresConfirmation && !hasAcceptedConfirmation(context.confirmation)) {
    return pluginBlockedAudit(pluginId, 'set_plugin_enabled', { pluginId, enabled }, 'Explicit confirmation is required before enabling this plugin.', context, inspection.policy);
  }

  const updatedPlugin = {
    ...plugin,
    enabled,
    updatedAt: getNow(context)(),
  };
  const nextRegistry = {
    ...registry,
    plugins: registry.plugins.map((item) => item.manifest.id === pluginId ? updatedPlugin : item),
  };
  return {
    ok: true,
    registry: nextRegistry,
    plugin: updatedPlugin,
    audit: createPluginAuditRecord({
      operation: 'set_plugin_enabled',
      subjectId: pluginId,
      status: 'success',
      args: { pluginId, enabled, reason: context.confirmation?.reason },
      policy: inspection.policy,
      context,
    }),
  };
}

export function inspectPlugin(
  registry: PluginRegistry,
  pluginId: string,
  context: Pick<PluginOperationContext, 'platform' | 'settings'>,
): PluginInspection | undefined {
  const plugin = registry.plugins.find((item) => item.manifest.id === pluginId);
  if (!plugin) {
    return undefined;
  }
  return {
    plugin,
    supportedOnPlatform: plugin.manifest.platforms.includes(context.platform),
    policy: evaluateToolInvocation(plugin.manifest.permissions, context.settings ?? defaultSecuritySettings),
  };
}

export function getPluginPlatformCapabilities(platform: PluginPlatform): {
  platform: PluginPlatform;
  httpMcp: boolean;
  stdioMcpRegistration: boolean;
  pluginManager: boolean;
} {
  return {
    platform,
    httpMcp: true,
    stdioMcpRegistration: platform === 'desktop',
    pluginManager: platform === 'desktop',
  };
}

function createPluginAuditRecord({
  operation,
  subjectId,
  status,
  args,
  error,
  policy,
  context,
}: {
  operation: string;
  subjectId: string;
  status: McpAuditStatus;
  args: unknown;
  error?: string;
  policy?: ToolInvocationPolicy;
  context: PluginOperationContext;
}): McpAuditRecord {
  return {
    id: context.createId?.() ?? crypto.randomUUID(),
    serverId: subjectId,
    toolName: operation,
    status,
    risk: policy?.risk,
    requiresConfirmation: policy?.requiresConfirmation,
    arguments: redactSensitiveObject(args),
    error,
    createdAt: getNow(context)(),
  };
}

function pluginBlockedAudit(
  subjectId: string,
  operation: string,
  args: unknown,
  error: string,
  context: PluginOperationContext,
  policy?: ToolInvocationPolicy,
): { ok: false; audit: McpAuditRecord } {
  return {
    ok: false,
    audit: createPluginAuditRecord({ operation, subjectId, status: 'blocked', args, error, policy, context }),
  };
}

function hasAcceptedConfirmation(confirmation: PluginConfirmation | undefined): confirmation is PluginConfirmation {
  return Boolean(confirmation?.accepted && confirmation.reason.trim() && confirmation.confirmedAt.trim());
}

function normalizeIdentifier(value: string, fallback: string): string {
  const normalized = value.trim().replace(/[^A-Za-z0-9:_-]/g, '-').replace(/-+/g, '-').slice(0, 128);
  return normalized || fallback;
}

function normalizeLauncherId(value: string): string | undefined {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._:-]{1,127}$/.test(normalized) || dangerousLauncherIds.has(normalized)) {
    return undefined;
  }
  return normalized;
}

function sanitizeArgs(args: string[]): string[] {
  return args
    .map((arg) => arg.trim())
    .filter((arg) => arg.length > 0 && arg.length <= 256)
    .filter((arg) => !/token|secret|password|api[_-]?key|authorization/i.test(arg));
}

function sanitizeEnvRefs(envRefs: string[]): string[] {
  return envRefs.reduce<string[]>((items, value) => {
    const trimmed = value.trim();
    if (/^[A-Z][A-Z0-9_]{1,63}$/.test(trimmed) && !items.includes(trimmed)) {
      return [...items, trimmed];
    }
    return items;
  }, []);
}

function uniquePlatforms(platforms: PluginPlatform[]): PluginPlatform[] {
  return platforms.reduce<PluginPlatform[]>((items, platform) => {
    if (['web', 'desktop', 'mobile'].includes(platform) && !items.includes(platform)) {
      return [...items, platform];
    }
    return items;
  }, []);
}

function uniqueCapabilities(capabilities: ToolCapability[]): ToolCapability[] {
  return capabilities.reduce<ToolCapability[]>((items, capability) => items.includes(capability) ? items : [...items, capability], []);
}

function normalizeProviderRequirements(requirements: PluginProviderRequirement[]): PluginProviderRequirement[] {
  return requirements.map((requirement) => ({
    type: requirement.type,
    features: requirement.features.reduce<ProviderFeatureSupport[]>((features, feature) => features.includes(feature) ? features : [...features, feature], []),
  }));
}

function normalizePluginRuntime(runtime: PluginRuntime): PluginRuntime {
  switch (runtime.type) {
    case 'http_mcp':
    case 'stdio_mcp':
      return { ...runtime, serverId: normalizeIdentifier(runtime.serverId, 'server') };
    case 'ui_extension':
      return { ...runtime, entryPoint: normalizeIdentifier(runtime.entryPoint, 'entry') };
  }
}

function getNow(context: Pick<PluginOperationContext, 'now'>): () => string {
  return context.now ?? (() => new Date().toISOString());
}
