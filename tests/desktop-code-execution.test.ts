import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDesktopCodeExecutionRequest,
  createCodeExecutionAuditRecord,
  evaluateCodeExecutionRequest,
  getCodeExecutionPlatformCapabilities,
  summarizeCodeExecutionResult,
} from '../packages/core/src/tools/code-execution.ts';
import {
  canUseDesktopCodeExecution,
  executeDesktopCode,
  summarizeDesktopNativeCapabilities,
} from '../apps/web/src/native-desktop.js';

const timestamp = '2026-05-02T17:30:00.000Z';

const enabledSettings = {
  terminalEnabled: false,
  codeExecutionEnabled: true,
  stdioMcpEnabled: false,
  broadFilesystemEnabled: false,
  requireConfirmationForHighRisk: true,
};

test('code execution capabilities are desktop-only and hidden on web and mobile', () => {
  assert.deepEqual(getCodeExecutionPlatformCapabilities('web'), {
    platform: 'web',
    visible: false,
    canExecute: false,
    supportedLanguages: [],
  });
  assert.deepEqual(getCodeExecutionPlatformCapabilities('mobile'), {
    platform: 'mobile',
    visible: false,
    canExecute: false,
    supportedLanguages: [],
  });
  assert.deepEqual(getCodeExecutionPlatformCapabilities('desktop'), {
    platform: 'desktop',
    visible: true,
    canExecute: true,
    supportedLanguages: ['javascript', 'python'],
  });
});

test('desktop code execution requests sanitize source and require confirmation plus enabled policy', () => {
  const request = buildDesktopCodeExecutionRequest({
    language: 'javascript',
    code: 'console.log(process.env.API_KEY)\n',
    timeoutMs: 99_999,
    stdin: 'hello',
    env: { API_KEY: 'secret', SAFE_FLAG: '1', invalid: 'x' },
  }, { now: () => timestamp });

  assert.equal(request.language, 'javascript');
  assert.equal(request.timeoutMs, 10_000);
  assert.deepEqual(request.envRefs, ['SAFE_FLAG']);
  assert.equal(request.stdin, 'hello');

  const blockedDefault = evaluateCodeExecutionRequest(request, {
    platform: 'desktop',
    confirmation: { accepted: true, reason: 'Run snippet', confirmedAt: timestamp },
  });
  const missingConfirmation = evaluateCodeExecutionRequest(request, {
    platform: 'desktop',
    settings: enabledSettings,
    confirmation: { accepted: false, reason: '', confirmedAt: timestamp },
  });
  const allowed = evaluateCodeExecutionRequest(request, {
    platform: 'desktop',
    settings: enabledSettings,
    confirmation: { accepted: true, reason: 'Run snippet', confirmedAt: timestamp },
  });

  assert.equal(blockedDefault.allowed, false);
  assert.match(blockedDefault.reason, /code_execution/);
  assert.equal(missingConfirmation.allowed, false);
  assert.match(missingConfirmation.reason, /confirmation/);
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.requiresConfirmation, true);
});

test('code execution audit records redact code secrets and summarize output', () => {
  const request = buildDesktopCodeExecutionRequest({
    language: 'python',
    code: "print('api_key=secret')",
    timeoutMs: 5000,
  }, { now: () => timestamp });
  const audit = createCodeExecutionAuditRecord({
    request,
    status: 'success',
    result: { exitCode: 0, stdout: 'ok\n', stderr: '', durationMs: 42, timedOut: false },
    now: () => timestamp,
    createId: () => 'audit-1',
  });

  assert.equal(audit.id, 'audit-1');
  assert.equal(audit.serverId, 'desktop-code-execution');
  assert.equal(audit.toolName, 'run_sandboxed_code');
  assert.equal(audit.resultSummary, 'exit 0, 3 stdout chars, 0 stderr chars, 42ms');
  assert.equal(audit.arguments.codePreview.includes('secret'), false);
  assert.equal(summarizeCodeExecutionResult({ exitCode: 1, stdout: 'x', stderr: 'err', durationMs: 100, timedOut: true }), 'timed out, exit 1, 1 stdout chars, 3 stderr chars, 100ms');
});

test('desktop Web helper invokes only the controlled sandbox command', async () => {
  const calls = [];
  const result = await executeDesktopCode({
    request: { language: 'javascript', code: 'console.log(1)', timeoutMs: 1000 },
    confirmation: { accepted: true, reason: 'Run', confirmedAt: timestamp },
    invoke: async (command, payload) => {
      calls.push({ command, payload });
      return { exitCode: 0, stdout: '1\n', stderr: '', durationMs: 10, timedOut: false };
    },
  });

  assert.equal(canUseDesktopCodeExecution({ __TAURI__: { core: { invoke() {} } } }), true);
  assert.equal(canUseDesktopCodeExecution({}), false);
  assert.deepEqual(calls.map((call) => call.command), ['run_sandboxed_code']);
  assert.equal(calls[0].payload.request.language, 'javascript');
  assert.equal(calls[0].payload.confirmation.reason, 'Run');
  assert.equal(result.stdout, '1\n');
});

test('desktop capability summary reports code execution separately when available', () => {
  const summary = summarizeDesktopNativeCapabilities({
    screen_capture: true,
    clipboard_image: true,
    global_shortcut: false,
    tray: true,
    keychain: true,
    local_ollama_detection: true,
    sandboxed_code_execution: true,
  });

  assert(summary.ready.some((item) => item.id === 'sandboxed_code_execution'));
});
