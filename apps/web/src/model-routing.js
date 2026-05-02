export function chooseProviderForRouting(providers, { strategy = 'balanced', task = 'text', failedProviderIds = [] } = {}) {
  const candidates = providers
    .filter((provider) => provider.enabled !== false && !failedProviderIds.includes(provider.id))
    .map((provider, index) => scoreProvider(provider, strategy, task, index))
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || left.index - right.index);
  return candidates[0];
}

const defaultT = (key, values = {}) => {
  const defaults = {
    'routing.noProvider': 'No enabled provider is available for routing.',
    'routing.chose': 'Routing chose {name} / {model} ({reasons}).',
    'routing.reason.lowCostMini': 'low-cost mini model',
    'routing.reason.localNoBilling': 'local model without provider billing',
    'routing.reason.standardRemotePricing': 'standard remote pricing',
    'routing.reason.smallFastModel': 'small fast model',
    'routing.reason.localLatency': 'local model latency depends on device',
    'routing.reason.standardLatency': 'standard model latency',
    'routing.reason.contextWindow': '{context} context window',
    'routing.reason.localPrivate': 'local/private provider',
    'routing.reason.remoteProvider': 'remote provider',
    'routing.reason.fallback': 'first available fallback',
    'routing.reason.balanced': 'balanced priority',
  };
  const template = defaults[key] ?? key;
  return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), template);
};

export function describeRoutingChoice(choice, { t = defaultT } = {}) {
  if (!choice) {
    return t('routing.noProvider');
  }
  return t('routing.chose', {
    name: choice.provider.name,
    model: choice.modelId,
    reasons: choice.reasons.map((reason) => translateReason(reason, t)).join(', '),
  });
}

function scoreProvider(provider, strategy, task, index) {
  const modelId = provider.defaultModelId ?? defaultModel(provider.type);
  if (!supportsTask(modelId, task)) return undefined;
  const reasons = [];
  let score = 100 - index;
  if (strategy === 'cheap') score += cheapScore(provider, modelId, reasons);
  if (strategy === 'fast') score += fastScore(provider, modelId, reasons);
  if (strategy === 'long-context') score += longContextScore(modelId, reasons);
  if (strategy === 'privacy') score += privacyScore(provider, reasons);
  if (strategy === 'fallback') {
    score += 300;
    reasons.push('first available fallback');
  }
  if (strategy === 'balanced') reasons.push('balanced priority');
  return { provider, modelId, score, reasons, index };
}

function cheapScore(provider, modelId, reasons) {
  const name = modelId.toLowerCase();
  if (name.includes('mini') || name.includes('small')) {
    reasons.push('low-cost mini model');
    return 1000;
  }
  if (provider.type === 'ollama') {
    reasons.push('local model without provider billing');
    return 700;
  }
  reasons.push('standard remote pricing');
  return 100;
}

function fastScore(provider, modelId, reasons) {
  const name = modelId.toLowerCase();
  if (name.includes('mini') || name.includes('small')) {
    reasons.push('small fast model');
    return 1000;
  }
  if (provider.type === 'ollama') {
    reasons.push('local model latency depends on device');
    return 450;
  }
  reasons.push('standard model latency');
  return 500;
}

function longContextScore(modelId, reasons) {
  const context = inferContextWindow(modelId);
  reasons.push(`${context} context window`);
  return Math.log2(context) * 60;
}

function privacyScore(provider, reasons) {
  if (provider.type === 'ollama' || isLocalUrl(provider.baseUrl)) {
    reasons.push('local/private provider');
    return 1000;
  }
  reasons.push('remote provider');
  return 0;
}

function supportsTask(modelId, task) {
  const name = modelId.toLowerCase();
  if (task === 'vision') return ['gpt-4o', 'vision', 'llava', 'qwen-vl'].some((item) => name.includes(item));
  if (task === 'reasoning') return ['reasoning', 'deepseek-r1', 'o3', 'o4'].some((item) => name.includes(item));
  return true;
}

function inferContextWindow(modelId) {
  const name = modelId.toLowerCase();
  if (name.includes('1m')) return 1_000_000;
  if (name.includes('200k') || name.includes('claude')) return 200_000;
  if (name.includes('128k') || name.includes('gpt-4.1') || name.includes('gpt-4o')) return 128_000;
  return 8_000;
}

function defaultModel(type) {
  if (type === 'ollama') return 'llama3.2';
  if (type === 'openai') return 'gpt-4.1-mini';
  return 'gpt-4.1-mini';
}

function isLocalUrl(url) {
  return typeof url === 'string' && /127\.0\.0\.1|localhost|0\.0\.0\.0/.test(url);
}

function translateReason(reason, t) {
  const contextMatch = /^(\d+) context window$/.exec(reason);
  if (contextMatch) {
    return t('routing.reason.contextWindow', { context: contextMatch[1] });
  }
  return t(reasonKeys[reason] ?? reason);
}

const reasonKeys = {
  'low-cost mini model': 'routing.reason.lowCostMini',
  'local model without provider billing': 'routing.reason.localNoBilling',
  'standard remote pricing': 'routing.reason.standardRemotePricing',
  'small fast model': 'routing.reason.smallFastModel',
  'local model latency depends on device': 'routing.reason.localLatency',
  'standard model latency': 'routing.reason.standardLatency',
  'local/private provider': 'routing.reason.localPrivate',
  'remote provider': 'routing.reason.remoteProvider',
  'first available fallback': 'routing.reason.fallback',
  'balanced priority': 'routing.reason.balanced',
};
