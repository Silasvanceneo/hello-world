import type { ToolCapability, ToolInvocationPolicy } from '@hello-world/shared';
import { evaluateToolInvocation, redactSensitiveObject } from '../security/security-policy.ts';

export type McpPlatform = 'web' | 'desktop' | 'mobile';

export type JsonSchemaProperty = {
  type?: 'string' | 'number' | 'boolean' | 'object' | 'array';
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
};

export type McpInputSchema = {
  type: 'object';
  required?: string[];
  properties?: Record<string, JsonSchemaProperty>;
};

export type HttpMcpTool = {
  name: string;
  description: string;
  capabilities: ToolCapability[];
  inputSchema: McpInputSchema;
};

export type HttpMcpServer = {
  id: string;
  name: string;
  endpoint: string;
  enabled: boolean;
  transport: 'http';
  headers?: Record<string, string>;
  tools: HttpMcpTool[];
  createdAt: string;
  updatedAt: string;
};

export type McpRegistry = {
  servers: HttpMcpServer[];
};

export type McpAuditStatus = 'success' | 'blocked' | 'error';

export type McpAuditRecord = {
  id: string;
  serverId: string;
  toolName: string;
  status: McpAuditStatus;
  risk?: ToolInvocationPolicy['risk'];
  requiresConfirmation?: boolean;
  arguments: unknown;
  resultSummary?: string;
  error?: string;
  createdAt: string;
};

export type HttpMcpCallContext = {
  fetch?: typeof fetch;
  now?: () => string;
  createId?: () => string;
};

export type HttpMcpCallResult =
  | { ok: true; result: unknown; audit: McpAuditRecord }
  | { ok: false; audit: McpAuditRecord };

export function createMcpRegistry(): McpRegistry {
  return { servers: [] };
}

export function createHttpMcpServer(
  draft: Omit<HttpMcpServer, 'transport' | 'createdAt' | 'updatedAt'>,
  timestamp = new Date().toISOString(),
): HttpMcpServer {
  return {
    ...draft,
    endpoint: sanitizeEndpoint(draft.endpoint),
    headers: sanitizeHeaders(draft.headers),
    transport: 'http',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function registerHttpMcpServer(registry: McpRegistry, server: HttpMcpServer): McpRegistry {
  const exists = registry.servers.some((item) => item.id === server.id);
  return {
    servers: exists
      ? registry.servers.map((item) => item.id === server.id ? server : item)
      : [server, ...registry.servers],
  };
}

export function validateMcpToolInput(schema: McpInputSchema, input: unknown): { ok: true } | { ok: false; message: string } {
  if (!isRecord(input)) {
    return { ok: false, message: 'Tool input must be an object.' };
  }
  for (const key of schema.required ?? []) {
    if (!(key in input)) {
      return { ok: false, message: `${key} is required.` };
    }
  }
  for (const [key, property] of Object.entries(schema.properties ?? {})) {
    if (!(key in input)) {
      continue;
    }
    const value = input[key];
    if (property.type && typeof value !== property.type) {
      return { ok: false, message: `${key} must be ${property.type}.` };
    }
    if (property.type === 'string' && typeof value === 'string') {
      if (property.minLength !== undefined && value.length < property.minLength) {
        return { ok: false, message: `${key} must be at least ${property.minLength} characters.` };
      }
      if (property.maxLength !== undefined && value.length > property.maxLength) {
        return { ok: false, message: `${key} must be at most ${property.maxLength} characters.` };
      }
    }
    if (property.type === 'number' && typeof value === 'number') {
      if (property.minimum !== undefined && value < property.minimum) {
        return { ok: false, message: `${key} must be at least ${property.minimum}.` };
      }
      if (property.maximum !== undefined && value > property.maximum) {
        return { ok: false, message: `${key} must be at most ${property.maximum}.` };
      }
    }
  }
  return { ok: true };
}

export async function callHttpMcpTool(
  server: HttpMcpServer,
  toolName: string,
  args: unknown,
  context: HttpMcpCallContext = {},
): Promise<HttpMcpCallResult> {
  const now = context.now ?? (() => new Date().toISOString());
  const tool = server.tools.find((item) => item.name === toolName);
  if (!server.enabled) {
    return blockedAudit(server, toolName, args, 'MCP server is disabled.', context);
  }
  if (!tool) {
    return blockedAudit(server, toolName, args, `MCP tool is not registered: ${toolName}`, context);
  }

  const policy = evaluateToolInvocation(tool.capabilities);
  if (!policy.allowed) {
    return { ok: false, audit: createMcpAuditRecord({ serverId: server.id, toolName, status: 'blocked', arguments: args, error: policy.reason, policy, now }) };
  }

  const validation = validateMcpToolInput(tool.inputSchema, args);
  if (!validation.ok) {
    return { ok: false, audit: createMcpAuditRecord({ serverId: server.id, toolName, status: 'blocked', arguments: args, error: validation.message, policy, now }) };
  }

  try {
    const fetchImpl = context.fetch ?? globalThis.fetch;
    if (!fetchImpl) {
      throw new Error('Fetch API is not available in this runtime.');
    }
    const response = await fetchImpl(server.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(server.headers ?? {}) },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: context.createId?.() ?? `mcp:${Date.now()}`,
        method: 'tools/call',
        params: { name: toolName, arguments: args },
      }),
    });
    if (!response.ok) {
      throw new Error(`HTTP MCP request failed: ${response.status} ${response.statusText}`);
    }
    const body = await response.json();
    const result = isRecord(body) && 'result' in body ? body.result : body;
    return {
      ok: true,
      result,
      audit: createMcpAuditRecord({
        serverId: server.id,
        toolName,
        status: 'success',
        arguments: args,
        resultSummary: summarizeMcpResult(result),
        policy,
        now,
      }),
    };
  } catch (error) {
    return {
      ok: false,
      audit: createMcpAuditRecord({
        serverId: server.id,
        toolName,
        status: 'error',
        arguments: args,
        error: error instanceof Error ? error.message : 'HTTP MCP call failed.',
        policy,
        now,
      }),
    };
  }
}

export function createMcpAuditRecord({
  serverId,
  toolName,
  status,
  arguments: args,
  resultSummary,
  error,
  policy,
  now = () => new Date().toISOString(),
  createId = () => crypto.randomUUID(),
}: {
  serverId: string;
  toolName: string;
  status: McpAuditStatus;
  arguments: unknown;
  resultSummary?: string;
  error?: string;
  policy?: ToolInvocationPolicy;
  now?: () => string;
  createId?: () => string;
}): McpAuditRecord {
  return {
    id: createId(),
    serverId,
    toolName,
    status,
    risk: policy?.risk,
    requiresConfirmation: policy?.requiresConfirmation,
    arguments: redactSensitiveObject(args),
    resultSummary,
    error,
    createdAt: now(),
  };
}

export function getMcpPlatformCapabilities(platform: McpPlatform): {
  platform: McpPlatform;
  httpMcp: boolean;
  stdioMcp: boolean;
  pluginManager: boolean;
} {
  return {
    platform,
    httpMcp: true,
    stdioMcp: false,
    pluginManager: platform === 'desktop',
  };
}

function blockedAudit(server: HttpMcpServer, toolName: string, args: unknown, error: string, context: HttpMcpCallContext): HttpMcpCallResult {
  return {
    ok: false,
    audit: createMcpAuditRecord({
      serverId: server.id,
      toolName,
      status: 'blocked',
      arguments: args,
      error,
      now: context.now,
      createId: context.createId,
    }),
  };
}

function sanitizeEndpoint(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    url.username = '';
    url.password = '';
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/token|key|secret|password/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    return url.toString().replace(/\?$/, '');
  } catch {
    return endpoint.trim();
  }
}

function sanitizeHeaders(headers: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!headers) {
    return undefined;
  }
  const safe = Object.fromEntries(Object.entries(headers).filter(([key]) => !/authorization|api[_-]?key|secret|token|password/i.test(key)));
  return Object.keys(safe).length > 0 ? safe : undefined;
}

function summarizeMcpResult(result: unknown): string {
  if (isRecord(result) && Array.isArray(result.content)) {
    return `${result.content.length} content item(s)`;
  }
  if (Array.isArray(result)) {
    return `${result.length} item(s)`;
  }
  return typeof result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
