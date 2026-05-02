import type { SecuritySettings, ToolInvocationPolicy } from '@hello-world/shared';
import { defaultSecuritySettings, evaluateToolInvocation, redactSensitiveText } from '../security/security-policy.ts';
import type { McpAuditRecord, McpAuditStatus, McpPlatform } from './http-mcp.ts';

export type CodeExecutionLanguage = 'javascript' | 'python';

export type CodeExecutionConfirmation = {
  accepted: boolean;
  reason: string;
  confirmedAt: string;
};

export type CodeExecutionDraft = {
  language: CodeExecutionLanguage;
  code: string;
  timeoutMs?: number;
  stdin?: string;
  env?: Record<string, string>;
};

export type DesktopCodeExecutionRequest = {
  language: CodeExecutionLanguage;
  code: string;
  timeoutMs: number;
  stdin?: string;
  envRefs: string[];
  createdAt: string;
};

export type CodeExecutionResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
};

export type CodeExecutionPolicyResult = ToolInvocationPolicy & {
  allowed: boolean;
};

export type CodeExecutionContext = {
  platform: McpPlatform;
  settings?: SecuritySettings;
  confirmation?: CodeExecutionConfirmation;
};

const maxCodeLength = 20_000;
const maxStdinLength = 8_000;
const minTimeoutMs = 500;
const maxTimeoutMs = 10_000;

export function getCodeExecutionPlatformCapabilities(platform: McpPlatform): {
  platform: McpPlatform;
  visible: boolean;
  canExecute: boolean;
  supportedLanguages: CodeExecutionLanguage[];
} {
  const desktop = platform === 'desktop';
  return {
    platform,
    visible: desktop,
    canExecute: desktop,
    supportedLanguages: desktop ? ['javascript', 'python'] : [],
  };
}

export function buildDesktopCodeExecutionRequest(
  draft: CodeExecutionDraft,
  context: { now?: () => string } = {},
): DesktopCodeExecutionRequest {
  return {
    language: draft.language,
    code: draft.code.slice(0, maxCodeLength),
    timeoutMs: clampTimeout(draft.timeoutMs ?? 5000),
    stdin: draft.stdin ? draft.stdin.slice(0, maxStdinLength) : undefined,
    envRefs: sanitizeEnvRefs(draft.env ?? {}),
    createdAt: context.now?.() ?? new Date().toISOString(),
  };
}

export function evaluateCodeExecutionRequest(
  _request: DesktopCodeExecutionRequest,
  context: CodeExecutionContext,
): CodeExecutionPolicyResult {
  if (context.platform !== 'desktop') {
    return { allowed: false, requiresConfirmation: false, risk: 'critical', reason: 'Code execution is Desktop-only.' };
  }
  const settings = context.settings ?? defaultSecuritySettings;
  if (!settings.codeExecutionEnabled) {
    return evaluateToolInvocation(['code_execution'], settings);
  }
  if (!hasAcceptedConfirmation(context.confirmation)) {
    return { allowed: false, requiresConfirmation: true, risk: 'critical', reason: 'Explicit confirmation is required before code execution.' };
  }
  return { allowed: true, requiresConfirmation: true, risk: 'critical', reason: 'Controlled Desktop sandbox runner approved by explicit confirmation.' };
}

export function createCodeExecutionAuditRecord({
  request,
  status,
  result,
  error,
  policy,
  now = () => new Date().toISOString(),
  createId = () => crypto.randomUUID(),
}: {
  request: DesktopCodeExecutionRequest;
  status: McpAuditStatus;
  result?: CodeExecutionResult;
  error?: string;
  policy?: ToolInvocationPolicy;
  now?: () => string;
  createId?: () => string;
}): McpAuditRecord {
  return {
    id: createId(),
    serverId: 'desktop-code-execution',
    toolName: 'run_sandboxed_code',
    status,
    risk: policy?.risk ?? 'critical',
    requiresConfirmation: policy?.requiresConfirmation ?? true,
    arguments: {
      language: request.language,
      timeoutMs: request.timeoutMs,
      envRefs: request.envRefs,
      codePreview: redactSensitiveText(request.code).slice(0, 160),
      codeLength: request.code.length,
      stdinLength: request.stdin?.length ?? 0,
    },
    resultSummary: result ? summarizeCodeExecutionResult(result) : undefined,
    error,
    createdAt: now(),
  };
}

export function summarizeCodeExecutionResult(result: CodeExecutionResult): string {
  return `${result.timedOut ? 'timed out, ' : ''}exit ${result.exitCode ?? 'unknown'}, ${result.stdout.length} stdout chars, ${result.stderr.length} stderr chars, ${result.durationMs}ms`;
}

function clampTimeout(timeoutMs: number): number {
  if (!Number.isFinite(timeoutMs)) {
    return 5000;
  }
  return Math.max(minTimeoutMs, Math.min(maxTimeoutMs, Math.trunc(timeoutMs)));
}

function sanitizeEnvRefs(env: Record<string, string>): string[] {
  return Object.keys(env).reduce<string[]>((items, key) => {
    if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(key)) {
      return items;
    }
    if (/API|KEY|TOKEN|SECRET|PASSWORD|AUTH/i.test(key)) {
      return items;
    }
    return items.includes(key) ? items : [...items, key];
  }, []);
}

function hasAcceptedConfirmation(confirmation: CodeExecutionConfirmation | undefined): confirmation is CodeExecutionConfirmation {
  return Boolean(confirmation?.accepted && confirmation.reason.trim() && confirmation.confirmedAt.trim());
}
