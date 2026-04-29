import type { ConnectionStatus, ProviderConnectionDraft, ProviderType } from '@hello-world/shared';

export type ProviderConnectionForm = {
  type: ProviderType;
  name: string;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
};

export function createProviderConnectionForm(type: ProviderType = 'openai-compatible'): ProviderConnectionForm {
  return { type, name: '', baseUrl: '', apiKey: '', enabled: true };
}

export function toProviderConnectionDraft(form: ProviderConnectionForm, apiKeyRef?: string): ProviderConnectionDraft {
  return {
    type: form.type,
    name: form.name,
    baseUrl: form.baseUrl || undefined,
    apiKeyRef,
    enabled: form.enabled,
  };
}

export function summarizeConnectionStatus(status: ConnectionStatus): string {
  if (status.ok) {
    const count = status.models?.length ?? 0;
    return `Connected. ${count} model${count === 1 ? '' : 's'} available.`;
  }

  const labelByReason = {
    auth: 'Authentication failed',
    network: 'Network error',
    model: 'Model endpoint error',
    configuration: 'Configuration error',
    unknown: 'Unknown error',
  } satisfies Record<typeof status.reason, string>;

  return `${labelByReason[status.reason]}: ${status.message}`;
}
