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

export function formatComparisonResult(result) {
  const speedLabel = `${result.durationMs} ms`;
  const tokenLabel = result.usage ? `${result.usage.totalTokens} tokens` : 'No token data';
  const statusLabel = result.status === 'fulfilled' ? 'Ready' : `Error: ${result.errorMessage ?? 'unknown error'}`;
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
