import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPlatformCapabilityMatrix,
  summarizePlatformReadiness,
  validateFinalCapabilityMatrix,
} from '../packages/core/src/diagnostics/platform-capability-matrix.ts';

test('final platform matrix exposes shared Web Desktop and Mobile safe workflows', () => {
  const matrix = createPlatformCapabilityMatrix();
  const web = summarizePlatformReadiness(matrix, 'web');
  const desktop = summarizePlatformReadiness(matrix, 'desktop');
  const mobile = summarizePlatformReadiness(matrix, 'mobile');

  assert.equal(web.capabilities.cloud_chat.status, 'available');
  assert.equal(web.capabilities.rag_query.status, 'available');
  assert.equal(web.capabilities.web_search.status, 'available');
  assert.equal(web.capabilities.http_mcp.status, 'available');
  assert.equal(mobile.capabilities.camera_input.status, 'available');
  assert.equal(mobile.capabilities.voice_io.status, 'available');
  assert.equal(mobile.capabilities.http_mcp.status, 'available');
  assert.equal(desktop.capabilities.stdio_mcp.status, 'desktop_only');
  assert.equal(desktop.capabilities.sandboxed_code_execution.status, 'desktop_only');
  assert.equal(desktop.capabilities.desktop_proxy.status, 'desktop_only');
});

test('final platform matrix keeps dangerous desktop features hidden from Web and Mobile', () => {
  const matrix = createPlatformCapabilityMatrix();

  for (const platform of ['web', 'mobile'] as const) {
    const summary = summarizePlatformReadiness(matrix, platform);
    assert.equal(summary.capabilities.stdio_mcp.status, 'unavailable');
    assert.equal(summary.capabilities.sandboxed_code_execution.status, 'unavailable');
    assert.equal(summary.capabilities.desktop_proxy.status, 'unavailable');
    assert.equal(summary.capabilities.terminal.status, 'blocked');
  }
});

test('final platform matrix validates required P10 acceptance coverage', () => {
  const result = validateFinalCapabilityMatrix(createPlatformCapabilityMatrix());

  assert.deepEqual(result, {
    ok: true,
    missing: [],
  });
});
