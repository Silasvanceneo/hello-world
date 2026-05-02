import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyProviderPresetToFields,
  createProviderFormPatch,
  getProviderPreset,
  providerPresets,
  renderProviderPresetOptions,
} from '../apps/web/src/provider-presets.js';

test('provider preset catalog covers common cloud providers and gateways without secrets', () => {
  const ids = providerPresets.map((preset) => preset.id);

  for (const id of [
    'openai',
    'anthropic',
    'gemini',
    'azure-openai',
    'xai',
    'deepseek',
    'qwen-dashscope',
    'qianfan',
    'hunyuan',
    'volcengine-ark',
    'kimi-moonshot',
    'zhipu-bigmodel',
    'mistral',
    'groq',
    'openrouter',
    'openrouter-claude',
    'siliconflow',
    'aihubmix',
    '302-ai',
  ]) {
    assert.equal(ids.includes(id), true, `${id} preset missing`);
  }

  assert.equal(providerPresets.filter((preset) => preset.category === 'cloud').length >= 10, true);
  assert.equal(providerPresets.filter((preset) => preset.category === 'gateway').length >= 5, true);

  for (const preset of providerPresets) {
    assert.equal(Object.keys(preset).some((key) => /api[_-]?key|secret|token|password/i.test(key)), false);
    assert.equal(Object.values(preset).some((value) => /sk-[A-Za-z0-9_-]{12,}|Bearer\s/i.test(String(value))), false);
  }
});

test('provider presets return OpenAI-compatible form patches for cloud APIs', () => {
  assert.deepEqual(createProviderFormPatch('gemini'), {
    name: 'Google Gemini',
    type: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    modelId: 'gemini-2.5-flash',
  });
  assert.deepEqual(createProviderFormPatch('anthropic'), {
    name: 'Anthropic Claude',
    type: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    modelId: 'claude-sonnet-4-5',
  });
  assert.deepEqual(createProviderFormPatch('azure-openai'), {
    name: 'Azure OpenAI',
    type: 'azure-openai',
    baseUrl: '',
    modelId: 'gpt-4.1-mini',
  });
  assert.deepEqual(createProviderFormPatch('deepseek'), {
    name: 'DeepSeek',
    type: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com',
    modelId: 'deepseek-v4-flash',
  });
  assert.deepEqual(createProviderFormPatch('qwen-dashscope'), {
    name: 'Alibaba Qwen (DashScope)',
    type: 'dashscope',
    baseUrl: 'https://dashscope.aliyuncs.com/api/v1',
    modelId: 'qwen-plus',
  });
});

test('provider presets return form patches for relay and local runtimes', () => {
  assert.deepEqual(createProviderFormPatch('openrouter'), {
    name: 'OpenRouter',
    type: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    modelId: 'openai/gpt-4o-mini',
  });
  assert.deepEqual(createProviderFormPatch('302-ai'), {
    name: '302.AI relay',
    type: 'openai-compatible',
    baseUrl: 'https://api.302.ai/v1',
    modelId: 'gpt-4o-mini',
  });
  assert.deepEqual(createProviderFormPatch('ollama'), {
    name: 'Local Ollama',
    type: 'ollama',
    baseUrl: 'http://127.0.0.1:11434',
    modelId: 'llama3.2',
  });
});

test('provider preset application fills connection fields without touching runtime API key', () => {
  const fields = {
    providerName: { value: '' },
    providerType: { value: '' },
    providerBaseUrl: { value: '' },
    providerModel: { value: '' },
    providerApiKey: { value: 'runtime-key' },
  };
  const result = applyProviderPresetToFields('siliconflow', fields, {
    t: (key, values = {}) => `${key}:${values.name ?? ''}:${values.model ?? ''}`,
  });

  assert.equal(result.applied, true);
  assert.equal(fields.providerName.value, 'SiliconFlow');
  assert.equal(fields.providerType.value, 'openai-compatible');
  assert.equal(fields.providerBaseUrl.value, 'https://api.siliconflow.cn/v1');
  assert.equal(fields.providerModel.value, 'Pro/zai-org/GLM-4.7');
  assert.equal(fields.providerApiKey.value, 'runtime-key');
  assert.equal(result.status, 'provider.presetApplied:SiliconFlow:Pro/zai-org/GLM-4.7');
});

test('provider preset options render grouped escaped labels', () => {
  const html = renderProviderPresetOptions({
    t: (key) => ({
      'provider.presetManual': 'Manual',
      'provider.category.cloud': 'Cloud',
      'provider.category.gateway': 'Gateway',
      'provider.category.local': 'Local',
      'provider.category.custom': 'Custom',
    })[key] ?? key,
  });

  assert.match(html, /<option value="">Manual<\/option>/);
  assert.match(html, /<optgroup label="Cloud">/);
  assert.match(html, /<optgroup label="Gateway">/);
  assert.match(html, /value="openrouter"/);
  assert.equal(getProviderPreset('missing'), undefined);
});
