import type { SecuritySettings, ToolCapability } from '@hello-world/shared';
import { defaultSecuritySettings, evaluateToolInvocation } from '@hello-world/core';

export type SecuritySettingsViewModel = {
  settings: SecuritySettings;
  disabledDangerousCapabilities: ToolCapability[];
};

export function createSecuritySettingsViewModel(settings: SecuritySettings = defaultSecuritySettings): SecuritySettingsViewModel {
  return {
    settings,
    disabledDangerousCapabilities: [
      ...(!settings.terminalEnabled ? ['terminal' as const] : []),
      ...(!settings.codeExecutionEnabled ? ['code_execution' as const] : []),
      ...(!settings.stdioMcpEnabled ? ['stdio_mcp' as const] : []),
      ...(!settings.broadFilesystemEnabled ? ['filesystem_broad' as const] : []),
    ],
  };
}

export function previewToolPolicy(capabilities: ToolCapability[]) {
  return evaluateToolInvocation(capabilities, defaultSecuritySettings);
}
