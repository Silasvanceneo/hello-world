export type ToolRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type ToolCapability =
  | 'read_only'
  | 'http_api'
  | 'knowledge_read'
  | 'file_write'
  | 'filesystem_broad'
  | 'terminal'
  | 'code_execution'
  | 'stdio_mcp'
  | 'network_proxy';

export type SecuritySettings = {
  terminalEnabled: boolean;
  codeExecutionEnabled: boolean;
  stdioMcpEnabled: boolean;
  broadFilesystemEnabled: boolean;
  requireConfirmationForHighRisk: boolean;
};

export type ToolInvocationPolicy = {
  allowed: boolean;
  requiresConfirmation: boolean;
  risk: ToolRiskLevel;
  reason: string;
};
