import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyToolRisk, defaultSecuritySettings, evaluateToolInvocation, redactSensitiveObject, redactSensitiveText } from '../packages/core/src/security/security-policy.ts';

test('default security settings keep dangerous capabilities disabled', () => {
  assert.equal(defaultSecuritySettings.terminalEnabled, false);
  assert.equal(defaultSecuritySettings.codeExecutionEnabled, false);
  assert.equal(defaultSecuritySettings.stdioMcpEnabled, false);
  assert.equal(defaultSecuritySettings.broadFilesystemEnabled, false);
});

test('tool risk classification and policy enforce confirmation or blocking', () => {
  assert.equal(classifyToolRisk(['read_only']), 'low');
  assert.equal(classifyToolRisk(['http_api']), 'medium');
  assert.equal(classifyToolRisk(['file_write']), 'high');
  assert.equal(classifyToolRisk(['terminal']), 'critical');

  assert.deepEqual(evaluateToolInvocation(['read_only']), { allowed: true, requiresConfirmation: false, risk: 'low', reason: 'Low-risk read-only tool.' });
  assert.equal(evaluateToolInvocation(['http_api']).requiresConfirmation, true);
  assert.equal(evaluateToolInvocation(['file_write']).requiresConfirmation, true);
  assert.equal(evaluateToolInvocation(['terminal']).allowed, false);
  assert.equal(evaluateToolInvocation(['stdio_mcp']).allowed, false);
});

test('critical capabilities stay blocked even when advanced toggles are enabled', () => {
  const permissiveSettings = {
    terminalEnabled: true,
    codeExecutionEnabled: true,
    stdioMcpEnabled: true,
    broadFilesystemEnabled: true,
    requireConfirmationForHighRisk: false,
  };

  assert.deepEqual(evaluateToolInvocation(['terminal'], permissiveSettings), {
    allowed: false,
    requiresConfirmation: false,
    risk: 'critical',
    reason: 'Critical tools are blocked unless a future explicit advanced policy enables them.',
  });
  assert.equal(evaluateToolInvocation(['read_only', 'code_execution'], permissiveSettings).allowed, false);
  assert.equal(evaluateToolInvocation(['http_api', 'network_proxy'], permissiveSettings).allowed, false);
});

test('redaction removes secrets from text and objects', () => {
  const syntheticKeyFixture = `sk-${'1234567890'}`;
  assert.equal(redactSensitiveText(`${'api_key'}=abc123 authorization: bearer token-123 ${syntheticKeyFixture}`), 'api_key=???? authorization: bearer ???? sk-????');
  assert.deepEqual(redactSensitiveObject({ nested: { token: 'abc', value: 'safe' }, list: [`sk-${'1234567890'}`] }), {
    nested: { token: '????', value: 'safe' },
    list: ['sk-????'],
  });
});
