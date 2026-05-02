export const providerPresets = [
  cloudPreset('openai', 'OpenAI', 'openai', 'https://api.openai.com/v1', 'gpt-4.1-mini'),
  cloudPreset('anthropic', 'Anthropic Claude', 'anthropic', 'https://api.anthropic.com/v1', 'claude-sonnet-4-5'),
  cloudPreset('gemini', 'Google Gemini', 'gemini', 'https://generativelanguage.googleapis.com/v1beta', 'gemini-2.5-flash'),
  cloudPreset('azure-openai', 'Azure OpenAI', 'azure-openai', '', 'gpt-4.1-mini'),
  cloudPreset('xai', 'xAI', 'openai-compatible', 'https://api.x.ai/v1', 'grok-4.20-reasoning'),
  cloudPreset('deepseek', 'DeepSeek', 'openai-compatible', 'https://api.deepseek.com', 'deepseek-v4-flash'),
  cloudPreset('qwen-dashscope', 'Alibaba Qwen (DashScope)', 'dashscope', 'https://dashscope.aliyuncs.com/api/v1', 'qwen-plus'),
  cloudPreset('qwen-dashscope-compatible', 'Alibaba Qwen compatible', 'openai-compatible', 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'qwen-plus'),
  cloudPreset('qianfan', 'Baidu Qianfan', 'openai-compatible', 'https://qianfan.baidubce.com/v2', 'ernie-4.0-turbo-8k'),
  cloudPreset('hunyuan', 'Tencent Hunyuan', 'openai-compatible', 'https://api.hunyuan.cloud.tencent.com/v1', 'hunyuan-turbos-latest'),
  cloudPreset('volcengine-ark', 'Volcengine Ark', 'openai-compatible', 'https://ark.cn-beijing.volces.com/api/v3', 'doubao-seed-1-6-251015'),
  cloudPreset('kimi-moonshot', 'Moonshot Kimi', 'openai-compatible', 'https://api.moonshot.cn/v1', 'moonshot-v1-8k'),
  cloudPreset('zhipu-bigmodel', 'Zhipu GLM', 'openai-compatible', 'https://open.bigmodel.cn/api/paas/v4', 'glm-4.6'),
  cloudPreset('mistral', 'Mistral AI', 'openai-compatible', 'https://api.mistral.ai/v1', 'mistral-small-latest'),
  cloudPreset('groq', 'Groq', 'openai-compatible', 'https://api.groq.com/openai/v1', 'llama-3.3-70b-versatile'),
  cloudPreset('together', 'Together AI', 'openai-compatible', 'https://api.together.xyz/v1', 'meta-llama/Llama-3.3-70B-Instruct-Turbo'),
  cloudPreset('fireworks', 'Fireworks AI', 'openai-compatible', 'https://api.fireworks.ai/inference/v1', 'accounts/fireworks/models/llama-v3p1-8b-instruct'),
  cloudPreset('cerebras', 'Cerebras', 'openai-compatible', 'https://api.cerebras.ai/v1', 'llama3.1-8b'),
  gatewayPreset('openrouter', 'OpenRouter', 'https://openrouter.ai/api/v1', 'openai/gpt-4o-mini'),
  gatewayPreset('openrouter-claude', 'Claude via OpenRouter', 'https://openrouter.ai/api/v1', 'anthropic/claude-sonnet-4.6'),
  gatewayPreset('siliconflow', 'SiliconFlow', 'https://api.siliconflow.cn/v1', 'Pro/zai-org/GLM-4.7'),
  gatewayPreset('aihubmix', 'AiHubMix relay', 'https://aihubmix.com/v1', 'gpt-4o-mini'),
  gatewayPreset('302-ai', '302.AI relay', 'https://api.302.ai/v1', 'gpt-4o-mini'),
  gatewayPreset('one-api', 'One API relay', '', 'gpt-4o-mini'),
  localPreset('ollama', 'Local Ollama', 'http://127.0.0.1:11434', 'llama3.2'),
];

const categoryOrder = ['cloud', 'gateway', 'local'];

export function getProviderPreset(id) {
  return providerPresets.find((preset) => preset.id === id);
}

export function createProviderFormPatch(id) {
  const preset = getProviderPreset(id);
  if (!preset) {
    return undefined;
  }
  return {
    name: preset.label,
    type: preset.type,
    baseUrl: preset.baseUrl,
    modelId: preset.modelId,
  };
}

export function applyProviderPresetToFields(id, fields, { t = defaultT } = {}) {
  const patch = createProviderFormPatch(id);
  if (!patch) {
    return { applied: false, status: t('provider.presetManualReady') };
  }
  fields.providerName.value = patch.name;
  fields.providerType.value = patch.type;
  fields.providerBaseUrl.value = patch.baseUrl;
  fields.providerModel.value = patch.modelId;
  return {
    applied: true,
    status: t('provider.presetApplied', { name: patch.name, model: patch.modelId || t('provider.modelManual') }),
  };
}

export function renderProviderPresetOptions({ t = defaultT } = {}) {
  const groups = categoryOrder.map((category) => {
    const options = providerPresets.filter((preset) => preset.category === category);
    if (options.length === 0) return '';
    return `<optgroup label="${escapeHtml(t(`provider.category.${category}`))}">
      ${options.map((preset) => `<option value="${escapeHtml(preset.id)}">${escapeHtml(preset.label)}</option>`).join('')}
    </optgroup>`;
  }).join('');
  return `<option value="">${escapeHtml(t('provider.presetManual'))}</option>${groups}`;
}

function cloudPreset(id, label, type, baseUrl, modelId) {
  return { id, label, type, baseUrl, modelId, category: 'cloud' };
}

function gatewayPreset(id, label, baseUrl, modelId) {
  return { id, label, type: 'openai-compatible', baseUrl, modelId, category: 'gateway' };
}

function localPreset(id, label, baseUrl, modelId) {
  return { id, label, type: 'ollama', baseUrl, modelId, category: 'local' };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function defaultT(key, values = {}) {
  const defaults = {
    'provider.presetManual': 'Custom / manual',
    'provider.presetManualReady': 'Manual provider settings are ready.',
    'provider.presetApplied': '{name} preset loaded with {model}. Enter the runtime API key, then save.',
    'provider.modelManual': 'manual model',
    'provider.category.cloud': 'Cloud APIs',
    'provider.category.gateway': 'Gateways / relays',
    'provider.category.local': 'Local runtimes',
  };
  const template = defaults[key] ?? key;
  return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), template);
}
