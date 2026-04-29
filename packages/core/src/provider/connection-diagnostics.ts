import type { AIModel, ConnectionStatus, ProviderConnection } from '@hello-world/shared';
import type { ProviderRegistry, ProviderRuntimeContext } from '@hello-world/api-client';
import { validateProviderConnection } from '@hello-world/api-client';

export type DiagnosticSeverity = 'info' | 'warning' | 'error';

export type ProviderDiagnosticFinding = {
  code:
    | 'ok'
    | 'invalid_api_key'
    | 'cors_or_network'
    | 'certificate_error'
    | 'proxy_error'
    | 'ollama_unreachable'
    | 'model_not_found'
    | 'model_list_empty'
    | 'provider_error';
  severity: DiagnosticSeverity;
  title: string;
  detail: string;
  actions: string[];
};

export type ProviderHealthReport = {
  connectionId: string;
  checkedAt: string;
  ok: boolean;
  findings: ProviderDiagnosticFinding[];
  models: AIModel[];
  fallbackModelId?: string;
};

export type ProviderHealthCheckOptions = {
  registry: ProviderRegistry;
  connection: ProviderConnection;
  runtime?: ProviderRuntimeContext;
  preferredModelId?: string;
};

export async function runProviderHealthCheck(options: ProviderHealthCheckOptions): Promise<ProviderHealthReport> {
  const status = await validateProviderConnection(options.registry, options.connection, options.runtime);
  return createProviderHealthReport(status, options.connection, options.preferredModelId);
}

export function createProviderHealthReport(
  status: ConnectionStatus,
  connection: ProviderConnection,
  preferredModelId?: string,
): ProviderHealthReport {
  if (!status.ok) {
    return {
      connectionId: connection.id,
      checkedAt: status.checkedAt,
      ok: false,
      findings: [explainConnectionFailure(status, connection)],
      models: [],
    };
  }

  const models = status.models ?? [];
  const fallbackModelId = chooseFallbackModel(models, preferredModelId);
  const findings: ProviderDiagnosticFinding[] = [];
  if (models.length === 0) {
    findings.push({
      code: 'model_list_empty',
      severity: 'warning',
      title: 'No models were returned',
      detail: 'The provider connection worked, but the model list was empty.',
      actions: ['Check provider permissions.', 'Enter a model name manually if the endpoint supports chat.'],
    });
  } else if (preferredModelId && fallbackModelId !== preferredModelId) {
    findings.push({
      code: 'model_not_found',
      severity: 'warning',
      title: 'Configured model was not found',
      detail: `${preferredModelId} was not returned by ${connection.name}.`,
      actions: [`Use ${fallbackModelId} as a fallback.`, 'Refresh the model list after changing provider settings.'],
    });
  } else {
    findings.push({
      code: 'ok',
      severity: 'info',
      title: 'Connection healthy',
      detail: `${connection.name} returned ${models.length} model${models.length === 1 ? '' : 's'}.`,
      actions: ['Use this provider for chat.'],
    });
  }

  return { connectionId: connection.id, checkedAt: status.checkedAt, ok: true, findings, models, fallbackModelId };
}

export function explainConnectionFailure(
  status: Extract<ConnectionStatus, { ok: false }>,
  connection: ProviderConnection,
): ProviderDiagnosticFinding {
  const message = status.message.toLowerCase();
  if (status.reason === 'auth') {
    return {
      code: 'invalid_api_key',
      severity: 'error',
      title: 'API key or authorization failed',
      detail: status.message,
      actions: ['Re-enter the API key.', 'Check that the key has model-list permission.', 'Confirm the provider base URL is correct.'],
    };
  }
  if (message.includes('certificate') || message.includes('tls') || message.includes('ssl') || message.includes('cert_')) {
    return {
      code: 'certificate_error',
      severity: 'error',
      title: 'TLS/certificate problem',
      detail: status.message,
      actions: ['Check the provider certificate.', 'Verify system time and corporate proxy certificates.'],
    };
  }
  if (message.includes('proxy') || message.includes('econnreset') || message.includes('etimedout') || message.includes('enotfound')) {
    return {
      code: 'proxy_error',
      severity: 'error',
      title: 'Proxy or network route problem',
      detail: status.message,
      actions: ['Check HTTP(S)_PROXY settings.', 'Try the provider endpoint in a browser or curl.'],
    };
  }
  if (connection.type === 'ollama' && status.reason === 'network') {
    return {
      code: 'ollama_unreachable',
      severity: 'error',
      title: 'Ollama is not reachable',
      detail: status.message,
      actions: ['Start Ollama locally.', 'Check that the base URL is http://127.0.0.1:11434.', 'Verify Ollama allows requests from this client.'],
    };
  }
  if (status.reason === 'network') {
    return {
      code: 'cors_or_network',
      severity: 'error',
      title: 'Network or browser CORS problem',
      detail: status.message,
      actions: ['If running in Web, use a self-hosted gateway or enable CORS on the provider.', 'Check base URL and network connectivity.'],
    };
  }
  if (status.reason === 'model') {
    return {
      code: 'model_not_found',
      severity: 'warning',
      title: 'Model endpoint was not found',
      detail: status.message,
      actions: ['Refresh the model list.', 'Check the configured model name.'],
    };
  }
  return {
    code: 'provider_error',
    severity: 'error',
    title: 'Provider returned an unknown error',
    detail: status.message,
    actions: ['Check provider status and logs.', 'Retry after confirming settings.'],
  };
}

function chooseFallbackModel(models: AIModel[], preferredModelId?: string): string | undefined {
  if (preferredModelId && models.some((model) => model.id === preferredModelId)) {
    return preferredModelId;
  }
  return models.find((model) => model.status === 'available')?.id ?? models[0]?.id;
}
