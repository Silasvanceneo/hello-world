const defaultT = (key, values = {}) => {
  const defaults = {
    'status.unknownProviderError': 'Unknown provider error.',
    'providerDiagnostics.apiKeyRejected': 'API key rejected by {name}. Re-enter the key and confirm model-list permissions.',
    'providerDiagnostics.ollamaUnreachable': 'Ollama is not reachable. Start Ollama and check http://127.0.0.1:11434.',
    'providerDiagnostics.corsFailure': 'Network/CORS failure. For Web, use a self-hosted gateway or enable CORS on the provider endpoint.',
    'providerDiagnostics.tlsFailure': 'TLS/certificate failure. Check system time, certificate trust, or proxy certificates.',
    'providerDiagnostics.proxyFailure': 'Proxy/network route failure. Check proxy settings and provider base URL.',
    'providerDiagnostics.validationFailed': 'Provider validation failed: {message}',
    'providerDiagnostics.noModels': 'Connected, but no models were returned. Enter a model manually if the provider supports chat.',
    'providerDiagnostics.fallbackModel': 'Connected. {preferred} was not listed; fallback suggestion: {fallback}.',
    'providerDiagnostics.connectedModels': 'Connected. {models}{suffix}',
  };
  const template = defaults[key] ?? key;
  return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), template);
};

export function describeProviderValidationError(error, provider, { t = defaultT } = {}) {
  const message = error instanceof Error ? error.message : t('status.unknownProviderError');
  const lower = message.toLowerCase();
  if (lower.includes('401') || lower.includes('403') || lower.includes('auth')) {
    return t('providerDiagnostics.apiKeyRejected', { name: provider.name });
  }
  if (provider.type === 'ollama' && (lower.includes('fetch') || lower.includes('network') || lower.includes('failed'))) {
    return t('providerDiagnostics.ollamaUnreachable');
  }
  if (lower.includes('cors') || lower.includes('failed to fetch')) {
    return t('providerDiagnostics.corsFailure');
  }
  if (lower.includes('certificate') || lower.includes('tls') || lower.includes('ssl')) {
    return t('providerDiagnostics.tlsFailure');
  }
  if (lower.includes('proxy') || lower.includes('econnreset') || lower.includes('etimedout') || lower.includes('enotfound')) {
    return t('providerDiagnostics.proxyFailure');
  }
  return t('providerDiagnostics.validationFailed', { message });
}

export function describeModelList(models, preferredModelId, { t = defaultT } = {}) {
  if (models.length === 0) {
    return t('providerDiagnostics.noModels');
  }
  if (preferredModelId && !models.includes(preferredModelId)) {
    return t('providerDiagnostics.fallbackModel', { preferred: preferredModelId, fallback: models[0] });
  }
  return t('providerDiagnostics.connectedModels', {
    models: models.slice(0, 3).join(', '),
    suffix: models.length > 3 ? '...' : '',
  });
}
