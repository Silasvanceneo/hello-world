export function describeProviderValidationError(error, provider) {
  const message = error instanceof Error ? error.message : 'Unknown provider error.';
  const lower = message.toLowerCase();
  if (lower.includes('401') || lower.includes('403') || lower.includes('auth')) {
    return `API key rejected by ${provider.name}. Re-enter the key and confirm model-list permissions.`;
  }
  if (provider.type === 'ollama' && (lower.includes('fetch') || lower.includes('network') || lower.includes('failed'))) {
    return 'Ollama is not reachable. Start Ollama and check http://127.0.0.1:11434.';
  }
  if (lower.includes('cors') || lower.includes('failed to fetch')) {
    return 'Network/CORS failure. For Web, use a self-hosted gateway or enable CORS on the provider endpoint.';
  }
  if (lower.includes('certificate') || lower.includes('tls') || lower.includes('ssl')) {
    return 'TLS/certificate failure. Check system time, certificate trust, or proxy certificates.';
  }
  if (lower.includes('proxy') || lower.includes('econnreset') || lower.includes('etimedout') || lower.includes('enotfound')) {
    return 'Proxy/network route failure. Check proxy settings and provider base URL.';
  }
  return `Provider validation failed: ${message}`;
}

export function describeModelList(models, preferredModelId) {
  if (models.length === 0) {
    return 'Connected, but no models were returned. Enter a model manually if the provider supports chat.';
  }
  if (preferredModelId && !models.includes(preferredModelId)) {
    return `Connected. ${preferredModelId} was not listed; fallback suggestion: ${models[0]}.`;
  }
  return `Connected. ${models.slice(0, 3).join(', ')}${models.length > 3 ? '...' : ''}`;
}
