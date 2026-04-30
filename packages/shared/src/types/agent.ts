export type AgentToolId =
  | 'file-attachments'
  | 'vision-input'
  | 'voice-io'
  | 'model-comparison'
  | 'http-mcp'
  | 'stdio-mcp'
  | 'terminal'
  | 'code-execution';

export type AgentKnowledgeBaseBinding = {
  scope: 'none' | 'session' | 'library';
  documentIds: string[];
};

export type AgentPreset = {
  id: string;
  name: string;
  systemPrompt: string;
  defaultModelId?: string;
  enabledTools: AgentToolId[];
  knowledgeBase: AgentKnowledgeBaseBinding;
  icon: string;
  createdAt: string;
  updatedAt: string;
};

export type AgentPresetDraft = {
  name: string;
  systemPrompt: string;
  defaultModelId?: string;
  enabledTools?: string[];
  knowledgeBase?: Partial<AgentKnowledgeBaseBinding>;
  icon?: string;
};
