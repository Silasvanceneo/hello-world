import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addBrowserFilesToState,
  addGeneratedImageResultToActiveSession,
  appendPromptText,
  createProviderDraftFromInputs,
  detectBrowserFileKind,
  escapeHtml,
  inferRoutingTask,
  rememberProviderSecret,
} from '../apps/web/src/runtime-helpers.js';
import {
  renderAgentPresetPanel,
  renderPromptTemplatePanel,
  renderRoutingPanel,
} from '../apps/web/src/runtime-panels.js';
import {
  createInitialWebState,
  upsertAgentPreset,
  upsertPromptTemplate,
} from '../apps/web/src/web-state.js';

const t = (key, values = {}) => {
  const defaults = {
    'agent.activeDetail': '{icon} {name}',
    'agent.noPreset': 'No preset',
    'agent.noneActiveDetail': 'No active preset',
    'prompt.noTemplate': 'No template',
    'prompt.noneSelectedDetail': 'No template selected',
    'prompt.selected': 'Selected {title}',
    'routing.noProvider': 'No provider configured',
    'image.generatedFor': 'Generated image for: {prompt}',
    'image.revisedPrompt': 'Revised prompt: {prompt}',
  };
  return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), defaults[key] ?? key);
};

test('runtime helpers create provider drafts and keep secrets runtime-only', () => {
  const elements = {
    providerName: { value: 'OpenAI' },
    providerType: { value: 'openai' },
    providerBaseUrl: { value: 'https://api.openai.com/v1' },
    providerModel: { value: 'gpt-4.1-mini' },
    providerImageModel: { value: 'gpt-image-1.5' },
    providerApiKey: { value: 'runtime-secret' },
  };
  const providerSecrets = new Map();
  const provider = createProviderDraftFromInputs(elements, 'provider-1', '2026-05-03T00:00:00.000Z');
  rememberProviderSecret(providerSecrets, elements.providerApiKey.value, provider);

  assert.equal(provider.id, 'provider-1');
  assert.equal(provider.imageModelId, 'gpt-image-1.5');
  assert.equal(provider.apiKeyRef, 'local:provider-1');
  assert.equal(providerSecrets.get('provider-1'), 'runtime-secret');
  assert.equal(JSON.stringify(provider).includes('runtime-secret'), false);
});

test('runtime helpers attach browser files and generated images immutably', () => {
  let state = createInitialWebState('2026-05-03T00:00:00.000Z');
  state = addBrowserFilesToState(state, [
    { name: 'photo.png', type: 'image/png', size: 10 },
    { name: 'notes.md', type: 'text/markdown', size: 20 },
  ], {
    idFactory: (() => {
      let index = 0;
      return () => `file-${++index}`;
    })(),
    now: () => '2026-05-03T00:00:01.000Z',
  });
  state = addGeneratedImageResultToActiveSession(state, {
    prompt: 'icon',
    providerId: 'provider-1',
    modelId: 'gpt-image-1.5',
    result: {
      images: [{ dataUrl: 'data:image/png;base64,aGVsbG8=', revisedPrompt: 'clean icon' }],
    },
    t,
    idFactory: (() => {
      let index = 0;
      return () => `generated-${++index}`;
    })(),
    timestamp: '2026-05-03T00:00:02.000Z',
  });

  const session = state.sessions[0];
  assert.deepEqual(session.attachments.map((attachment) => attachment.kind), ['image', 'markdown', 'image']);
  assert.equal(session.messages.at(-1)?.usage.totalTokens > 0, true);
  assert.match(session.messages.at(-1)?.content[0]?.text, /Revised prompt: clean icon/);
  assert.equal(detectBrowserFileKind({ name: 'table.xlsx', type: '' }), 'xlsx');
  assert.equal(inferRoutingTask(session), 'vision');
});

test('runtime helper text utilities are escaped and append to prompt target', () => {
  const prompt = {
    value: 'Existing',
    focused: false,
    focus() {
      this.focused = true;
    },
  };

  appendPromptText(prompt, 'Next');

  assert.equal(prompt.value, 'Existing\nNext');
  assert.equal(prompt.focused, true);
  assert.equal(escapeHtml('<b>"x"</b>'), '&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
});

test('runtime panels render active agent prompt and routing summaries', () => {
  let state = createInitialWebState('2026-05-03T00:00:00.000Z');
  state = upsertAgentPreset(state, {
    id: 'agent-1',
    name: 'Research',
    icon: 'AI',
    systemPrompt: 'Be precise.',
    defaultModelId: 'gpt-4.1-mini',
    enabledTools: ['vision-input'],
    knowledgeBase: { scope: 'library', documentIds: [] },
    createdAt: '2026-05-03T00:00:00.000Z',
    updatedAt: '2026-05-03T00:00:00.000Z',
  });
  state = { ...state, activeAgentPresetId: 'agent-1' };
  state = upsertPromptTemplate(state, {
    id: 'prompt-1',
    title: 'Summary',
    body: 'Summarize {{topic}}',
    variables: ['topic'],
    tags: ['work'],
    favorite: true,
    scope: 'local',
    createdAt: '2026-05-03T00:00:00.000Z',
    updatedAt: '2026-05-03T00:00:00.000Z',
  });
  state = { ...state, activePromptTemplateId: 'prompt-1' };
  const elements = createPanelElements();

  renderAgentPresetPanel({ elements, state, t });
  renderPromptTemplatePanel({ elements, state, t });
  renderRoutingPanel({ elements, state, t });

  assert.equal(elements.agentName.value, 'Research');
  assert.equal(elements.agentStatus.textContent, 'AI Research');
  assert.equal(elements.promptTemplateTitle.value, 'Summary');
  assert.equal(elements.promptTemplateSelect.innerHTML.includes('Summary'), true);
  assert.equal(elements.routingStatus.textContent.length > 0, true);
});

function createPanelElements() {
  return {
    agentIcon: input(),
    agentKnowledgeBase: input(),
    agentModel: input(),
    agentName: input(),
    agentPresetSelect: input(),
    agentStatus: text(),
    agentSystemPrompt: input(),
    agentTools: input(),
    promptTemplateBody: input(),
    promptTemplateFavorite: checkbox(),
    promptTemplateScope: input(),
    promptTemplateSelect: input(),
    promptTemplateStatus: text(),
    promptTemplateTags: input(),
    promptTemplateTitle: input(),
    promptTemplateVariables: input(),
    routingStatus: text(),
    routingStrategy: input('balanced'),
  };
}

function input(value = '') {
  return { value, innerHTML: '', textContent: '' };
}

function checkbox(checked = false) {
  return { ...input(), checked };
}

function text(value = '') {
  return { textContent: value, innerHTML: '' };
}
