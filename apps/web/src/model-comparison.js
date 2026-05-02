import { defaultModel, streamChatInBrowser } from './provider-runtime.js';

export async function compareProvidersInBrowser({
  providers,
  prompt,
  messages,
  providerSecrets,
  streamChat = streamChatInBrowser,
  now = () => new Date().toISOString(),
  nowMs = () => performance.now(),
}) {
  const candidates = providers.filter((provider) => provider.enabled !== false);
  return Promise.all(candidates.map(async (provider) => {
    const modelId = provider.defaultModelId ?? defaultModel(provider.type);
    const startedAt = now();
    const startedMs = nowMs();
    try {
      const text = await streamChat({
        provider,
        modelId,
        apiKey: providerSecrets.get(provider.id),
        messages: [...messages, { role: 'user', content: prompt }],
      });
      const completedAt = now();
      return {
        id: `${provider.id}:${modelId}`,
        providerId: provider.id,
        providerName: provider.name,
        modelId,
        status: 'fulfilled',
        text,
        usage: estimateTokenUsage(prompt, text),
        durationMs: Math.max(0, Math.round(nowMs() - startedMs)),
        startedAt,
        completedAt,
      };
    } catch (error) {
      const completedAt = now();
      return {
        id: `${provider.id}:${modelId}`,
        providerId: provider.id,
        providerName: provider.name,
        modelId,
        status: 'failed',
        text: '',
        errorMessage: error instanceof Error ? error.message : 'Unknown provider error.',
        durationMs: Math.max(0, Math.round(nowMs() - startedMs)),
        startedAt,
        completedAt,
      };
    }
  }));
}

const defaultT = (key, values = {}) => {
  const defaults = {
    'comparison.noTokenData': 'No token data',
    'comparison.ready': 'Ready',
    'comparison.error': 'Error: {message}',
    'comparison.unknownError': 'unknown error',
    'usage.tokens': '{count} tokens',
  };
  const template = defaults[key] ?? key;
  return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), template);
};

export function formatComparisonResult(result, { t = defaultT } = {}) {
  const speedLabel = `${result.durationMs} ms`;
  const tokenLabel = result.usage ? t('usage.tokens', { count: result.usage.totalTokens }) : t('comparison.noTokenData');
  const statusLabel = result.status === 'fulfilled'
    ? t('comparison.ready')
    : t('comparison.error', { message: result.errorMessage ?? t('comparison.unknownError') });
  return {
    title: `${result.providerName} / ${result.modelId}`,
    statusLabel,
    speedLabel,
    tokenLabel,
    canSave: result.status === 'fulfilled' && result.text.trim().length > 0,
  };
}

export function estimateTokenUsage(prompt, completion) {
  const promptTokens = countTokens(prompt);
  const completionTokens = countTokens(completion);
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}

function countTokens(text) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}
