import assert from 'node:assert/strict';
import test from 'node:test';
import {
  callHttpMcpTool,
  createHttpMcpServer,
  createMcpAuditRecord,
  createMcpRegistry,
  getMcpPlatformCapabilities,
  registerHttpMcpServer,
  validateMcpToolInput,
} from '../packages/core/src/tools/http-mcp.ts';
import { evaluateToolInvocation } from '../packages/core/src/security/security-policy.ts';

const timestamp = '2026-05-02T15:00:00.000Z';

test('HTTP MCP registry stores configurable servers without secrets', () => {
  const server = createHttpMcpServer({
    id: 'docs',
    name: 'Docs search',
    endpoint: 'https://mcp.example.com/rpc?token=secret',
    enabled: true,
    headers: { authorization: 'Bearer runtime-secret', 'x-safe': 'ok' },
    tools: [{
      name: 'search_docs',
      description: 'Search docs',
      capabilities: ['http_api', 'knowledge_read'],
      inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string' } } },
    }],
  }, timestamp);
  const registry = registerHttpMcpServer(createMcpRegistry(), server);

  assert.equal(registry.servers[0]?.endpoint, 'https://mcp.example.com/rpc');
  assert.equal(registry.servers[0]?.headers?.authorization, undefined);
  assert.equal(registry.servers[0]?.headers?.['x-safe'], 'ok');
  assert.equal(registry.servers[0]?.transport, 'http');
});

test('HTTP MCP tool input validation enforces object schema and required primitive types', () => {
  const schema = {
    type: 'object',
    required: ['query', 'limit'],
    properties: {
      query: { type: 'string', minLength: 2 },
      limit: { type: 'number', minimum: 1, maximum: 10 },
      includeArchived: { type: 'boolean' },
    },
  };

  assert.deepEqual(validateMcpToolInput(schema, { query: 'rag', limit: 5, includeArchived: false }), { ok: true });
  assert.deepEqual(validateMcpToolInput(schema, { query: 'r', limit: 5 }), {
    ok: false,
    message: 'query must be at least 2 characters.',
  });
  assert.deepEqual(validateMcpToolInput(schema, { query: 'rag', limit: 99 }), {
    ok: false,
    message: 'limit must be at most 10.',
  });
});

test('HTTP MCP calls schema-validated tools and writes redacted audit records', async () => {
  const server = createHttpMcpServer({
    id: 'docs',
    name: 'Docs search',
    endpoint: 'https://mcp.example.com/rpc',
    enabled: true,
    tools: [{
      name: 'search_docs',
      description: 'Search docs',
      capabilities: ['http_api', 'knowledge_read'],
      inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string' }, apiKey: { type: 'string' } } },
    }],
  }, timestamp);
  const result = await callHttpMcpTool(server, 'search_docs', { query: 'rag', apiKey: 'runtime-secret' }, {
    now: () => timestamp,
    fetch: async (url, init) => {
      assert.equal(url, 'https://mcp.example.com/rpc');
      const body = JSON.parse(String(init?.body));
      assert.equal(body.method, 'tools/call');
      assert.equal(body.params.name, 'search_docs');
      return new Response(JSON.stringify({ result: { content: [{ type: 'text', text: 'RAG result' }] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.audit.toolName, 'search_docs');
  assert.equal(result.audit.status, 'success');
  assert.equal(result.audit.arguments.query, 'rag');
  assert.equal(result.audit.arguments.apiKey, '????');
  assert.equal(result.audit.resultSummary, '1 content item(s)');
});

test('HTTP MCP denies disabled, missing, invalid, and unsafe tool calls with audit evidence', async () => {
  const server = createHttpMcpServer({
    id: 'unsafe',
    name: 'Unsafe',
    endpoint: 'https://mcp.example.com/rpc',
    enabled: false,
    tools: [{
      name: 'run_terminal',
      description: 'Nope',
      capabilities: ['terminal'],
      inputSchema: { type: 'object', properties: {} },
    }],
  }, timestamp);

  const disabled = await callHttpMcpTool(server, 'run_terminal', {}, { now: () => timestamp });
  const enabledUnsafe = await callHttpMcpTool({ ...server, enabled: true }, 'run_terminal', {}, { now: () => timestamp });
  const missing = await callHttpMcpTool({ ...server, enabled: true }, 'missing', {}, { now: () => timestamp });

  assert.equal(disabled.ok, false);
  assert.equal(disabled.audit.status, 'blocked');
  assert.match(disabled.audit.error ?? '', /disabled/);
  assert.equal(enabledUnsafe.ok, false);
  assert.equal(enabledUnsafe.audit.status, 'blocked');
  assert.equal(evaluateToolInvocation(['terminal']).allowed, false);
  assert.equal(missing.ok, false);
  assert.match(missing.audit.error ?? '', /not registered/);
});

test('MCP audit records redact nested secrets and preserve status metadata', () => {
  const audit = createMcpAuditRecord({
    serverId: 's1',
    toolName: 'lookup',
    status: 'error',
    arguments: { nested: { token: 'abc', query: 'safe' } },
    error: 'upstream failed',
    now: () => timestamp,
  });

  assert.deepEqual(audit.arguments, { nested: { token: '????', query: 'safe' } });
  assert.equal(audit.error, 'upstream failed');
  assert.equal(audit.createdAt, timestamp);
});

test('HTTP MCP is shared across Web Desktop and Mobile while stdio remains desktop-only and blocked by default', () => {
  assert.equal(getMcpPlatformCapabilities('web').httpMcp, true);
  assert.equal(getMcpPlatformCapabilities('mobile').httpMcp, true);
  assert.equal(getMcpPlatformCapabilities('desktop').httpMcp, true);
  assert.equal(getMcpPlatformCapabilities('web').stdioMcp, false);
  assert.equal(getMcpPlatformCapabilities('desktop').stdioMcp, false);
  assert.equal(evaluateToolInvocation(['stdio_mcp']).allowed, false);
});
