import type { AgentPreset, AgentPresetDraft, AgentToolId, ChatMessage, SecuritySettings, ToolCapability, ToolInvocationPolicy } from '@hello-world/shared';
import { defaultSecuritySettings, evaluateToolInvocation } from '../security/security-policy.ts';

export type AgentToolRisk = 'low' | 'medium' | 'high' | 'critical';

export type AgentToolDefinition = {
  id: AgentToolId;
  label: string;
  risk: AgentToolRisk;
};

export type AgentPresetRuntimeMessage = {
  role: ChatMessage['role'];
  content: string;
};

export type AgentToolPolicy = {
  toolId: AgentToolId;
  capabilities: ToolCapability[];
  policy: ToolInvocationPolicy;
};

export type CreateAgentPresetOptions = {
  id?: string;
  now?: () => string;
};

export const agentToolCatalog: AgentToolDefinition[] = [
  { id: 'file-attachments', label: 'File attachments', risk: 'low' },
  { id: 'vision-input', label: 'Vision input', risk: 'low' },
  { id: 'voice-io', label: 'Voice I/O', risk: 'low' },
  { id: 'model-comparison', label: 'Model comparison', risk: 'low' },
  { id: 'http-mcp', label: 'HTTP MCP', risk: 'medium' },
  { id: 'stdio-mcp', label: 'stdio MCP', risk: 'high' },
  { id: 'terminal', label: 'Terminal', risk: 'critical' },
  { id: 'code-execution', label: 'Code execution', risk: 'critical' },
];

const knownToolIds = new Set(agentToolCatalog.map((tool) => tool.id));
const defaultToolIds: AgentToolId[] = ['file-attachments', 'vision-input', 'voice-io', 'model-comparison'];

export function createAgentPreset(draft: AgentPresetDraft, options: CreateAgentPresetOptions = {}): AgentPreset {
  const now = options.now ?? (() => new Date().toISOString());
  const timestamp = now();
  const id = options.id ?? crypto.randomUUID();
  const systemPrompt = draft.systemPrompt.trim();
  const defaultModelId = draft.defaultModelId?.trim();
  return {
    id,
    name: draft.name.trim() || 'New agent',
    systemPrompt,
    defaultModelId: defaultModelId || undefined,
    enabledTools: normalizeTools(draft.enabledTools),
    knowledgeBase: {
      scope: draft.knowledgeBase?.scope ?? 'none',
      documentIds: uniqueNonEmpty(draft.knowledgeBase?.documentIds ?? []),
    },
    icon: draft.icon?.trim() || '◯',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function upsertAgentPreset(presets: AgentPreset[], preset: AgentPreset): AgentPreset[] {
  return presets.some((item) => item.id === preset.id)
    ? presets.map((item) => (item.id === preset.id ? preset : item))
    : [preset, ...presets];
}

export function deleteAgentPreset(presets: AgentPreset[], presetId: string): AgentPreset[] {
  return presets.filter((preset) => preset.id !== presetId);
}

export function findAgentPreset(presets: AgentPreset[], presetId?: string): AgentPreset | undefined {
  return presets.find((preset) => preset.id === presetId) ?? presets[0];
}

export function buildAgentRuntimeMessages(
  preset: AgentPreset | undefined,
  messages: ChatMessage[],
): AgentPresetRuntimeMessage[] {
  const conversation = messages.map(toRuntimeMessage).filter((message) => message.content.length > 0);
  if (!preset?.systemPrompt.trim()) {
    return conversation;
  }
  return [{ role: 'system', content: preset.systemPrompt.trim() }, ...conversation];
}

export function evaluateAgentPresetToolPolicy(
  preset: Pick<AgentPreset, 'enabledTools'>,
  settings: SecuritySettings = defaultSecuritySettings,
): AgentToolPolicy[] {
  return preset.enabledTools.map((toolId) => {
    const capabilities = getAgentToolCapabilities(toolId);
    return {
      toolId,
      capabilities,
      policy: evaluateToolInvocation(capabilities, settings),
    };
  });
}

export function getAgentToolCapabilities(toolId: AgentToolId): ToolCapability[] {
  switch (toolId) {
    case 'http-mcp':
      return ['http_api'];
    case 'stdio-mcp':
      return ['stdio_mcp'];
    case 'terminal':
      return ['terminal'];
    case 'code-execution':
      return ['code_execution'];
    case 'file-attachments':
    case 'vision-input':
    case 'voice-io':
    case 'model-comparison':
      return ['read_only'];
  }
}

export function describeAgentPreset(preset: AgentPreset): string {
  const model = preset.defaultModelId ? `model ${preset.defaultModelId}` : 'provider default model';
  const knowledge = preset.knowledgeBase.scope === 'none' ? 'no bound knowledge base' : `${preset.knowledgeBase.scope} knowledge`;
  return `${preset.icon} ${preset.name}: ${model}, ${preset.enabledTools.length} tools, ${knowledge}`;
}

function normalizeTools(values: string[] | undefined): AgentToolId[] {
  const candidates = values && values.length > 0 ? values : defaultToolIds;
  return candidates.reduce<AgentToolId[]>((tools, value) => {
    if (!knownToolIds.has(value as AgentToolId) || tools.includes(value as AgentToolId)) {
      return tools;
    }
    return [...tools, value as AgentToolId];
  }, []);
}

function uniqueNonEmpty(values: string[]): string[] {
  return values.reduce<string[]>((items, value) => {
    const trimmed = value.trim();
    return trimmed && !items.includes(trimmed) ? [...items, trimmed] : items;
  }, []);
}

function toRuntimeMessage(message: ChatMessage): AgentPresetRuntimeMessage {
  return {
    role: message.role,
    content: message.content
      .filter((item) => item.type === 'text')
      .map((item) => item.text)
      .join('\n')
      .trim(),
  };
}
