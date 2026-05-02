import type { SecuritySettings, ToolCapability, ToolInvocationPolicy, ToolRiskLevel } from '@hello-world/shared';

export const defaultSecuritySettings: SecuritySettings = {
  terminalEnabled: false,
  codeExecutionEnabled: false,
  stdioMcpEnabled: false,
  broadFilesystemEnabled: false,
  requireConfirmationForHighRisk: true,
};

export function classifyToolRisk(capabilities: ToolCapability[]): ToolRiskLevel {
  if (capabilities.some((capability) => ['terminal', 'code_execution', 'network_proxy'].includes(capability))) {
    return 'critical';
  }
  if (capabilities.some((capability) => ['file_write', 'filesystem_broad', 'stdio_mcp', 'sensitive'].includes(capability))) {
    return 'high';
  }
  if (capabilities.some((capability) => ['http_api', 'knowledge_read'].includes(capability))) {
    return 'medium';
  }
  return 'low';
}

export function evaluateToolInvocation(
  capabilities: ToolCapability[],
  settings: SecuritySettings = defaultSecuritySettings,
): ToolInvocationPolicy {
  const risk = classifyToolRisk(capabilities);
  const blockedCapability = firstBlockedCapability(capabilities, settings);
  if (blockedCapability) {
    return { allowed: false, requiresConfirmation: false, risk, reason: `${blockedCapability} is disabled by default.` };
  }

  if (risk === 'critical') {
    return { allowed: false, requiresConfirmation: false, risk, reason: 'Critical tools are blocked unless a future explicit advanced policy enables them.' };
  }

  if (risk === 'high') {
    return { allowed: true, requiresConfirmation: settings.requireConfirmationForHighRisk, risk, reason: 'High-risk tools require explicit confirmation.' };
  }

  if (risk === 'medium') {
    return { allowed: true, requiresConfirmation: true, risk, reason: 'Medium-risk tools require first-use confirmation.' };
  }

  return { allowed: true, requiresConfirmation: false, risk, reason: 'Low-risk read-only tool.' };
}

export function redactSensitiveText(value: string): string {
  return value
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-????')
    .replace(/(api[_-]?key\s*[:=]\s*)([^\s,;]+)/gi, '$1????')
    .replace(/(authorization\s*[:=]\s*bearer\s+)([^\s,;]+)/gi, '$1????');
}

export function redactSensitiveObject<T>(value: T): T {
  if (typeof value === 'string') {
    return redactSensitiveText(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveObject(item)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => {
        const isSensitiveKey = /api[_-]?key|authorization|password|secret|token/i.test(key);
        return [key, isSensitiveKey ? '????' : redactSensitiveObject(entry)];
      }),
    ) as T;
  }

  return value;
}

function firstBlockedCapability(capabilities: ToolCapability[], settings: SecuritySettings): ToolCapability | undefined {
  if (!settings.terminalEnabled && capabilities.includes('terminal')) {
    return 'terminal';
  }
  if (!settings.codeExecutionEnabled && capabilities.includes('code_execution')) {
    return 'code_execution';
  }
  if (!settings.stdioMcpEnabled && capabilities.includes('stdio_mcp')) {
    return 'stdio_mcp';
  }
  if (!settings.broadFilesystemEnabled && capabilities.includes('filesystem_broad')) {
    return 'filesystem_broad';
  }
  return undefined;
}
