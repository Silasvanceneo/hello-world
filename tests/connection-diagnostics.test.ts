import assert from 'node:assert/strict';
import test from 'node:test';
import { createProviderHealthReport, explainConnectionFailure, runProviderHealthCheck } from '../packages/core/src/provider/connection-diagnostics.ts';
import type { ProviderConnection } from '@hello-world/shared';
import type { ProviderAdapter } from '../packages/api-client/src/index.ts';
import { createProviderRegistry } from '../packages/api-client/src/index.ts';

const connection: ProviderConnection = {
  id: 'provider-1',
  type: 'openai-compatible',
  name: 'Provider',
  enabled: true,
  createdAt: '2026-04-29T00:00:00.000Z',
  updatedAt: '2026-04-29T00:00:00.000Z',
};

test('connection diagnostics explain auth and CORS/network failures', () => {
  const auth = explainConnectionFailure({
    ok: false,
    checkedAt: '2026-04-29T00:00:00.000Z',
    reason: 'auth',
    message: '401 Unauthorized',
  }, connection);
  const cors = explainConnectionFailure({
    ok: false,
    checkedAt: '2026-04-29T00:00:00.000Z',
    reason: 'network',
    message: 'Failed to fetch due to CORS',
  }, connection);

  assert.equal(auth.code, 'invalid_api_key');
  assert.match(auth.actions.join(' '), /Re-enter/);
  assert.equal(cors.code, 'cors_or_network');
});

test('connection diagnostics identify unreachable Ollama', () => {
  const finding = explainConnectionFailure({
    ok: false,
    checkedAt: '2026-04-29T00:00:00.000Z',
    reason: 'network',
    message: 'fetch failed',
  }, { ...connection, type: 'ollama', name: 'Local Ollama' });

  assert.equal(finding.code, 'ollama_unreachable');
  assert.match(finding.actions.join(' '), /Start Ollama/);
});

test('healthy reports include model fallback when preferred model is missing', () => {
  const report = createProviderHealthReport({
    ok: true,
    checkedAt: '2026-04-29T00:00:00.000Z',
    models: [
      { id: 'gpt-a', providerId: 'provider-1', displayName: 'gpt-a', capability: textCapability(), status: 'available' },
    ],
  }, connection, 'gpt-missing');

  assert.equal(report.ok, true);
  assert.equal(report.fallbackModelId, 'gpt-a');
  assert.equal(report.findings[0]?.code, 'model_not_found');
});

test('runProviderHealthCheck validates through the registry', async () => {
  const adapter: ProviderAdapter = {
    id: 'custom',
    type: 'custom',
    async listModels() { return []; },
    async *chat() {},
    async validateConnection() {
      return {
        ok: false,
        checkedAt: '2026-04-29T00:00:00.000Z',
        reason: 'network',
        message: 'proxy ECONNRESET',
      };
    },
  };
  const report = await runProviderHealthCheck({
    registry: createProviderRegistry([adapter]),
    connection: { ...connection, type: 'custom' },
  });

  assert.equal(report.ok, false);
  assert.equal(report.findings[0]?.code, 'proxy_error');
});

function textCapability() {
  return {
    supportsText: true,
    supportsVision: false,
    supportsFiles: false,
    supportsTools: false,
    supportsReasoning: false,
    supportsImageGeneration: false,
    supportsAudioInput: false,
    supportsAudioOutput: false,
  };
}
