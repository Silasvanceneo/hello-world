import assert from 'node:assert/strict';
import test from 'node:test';
import { applyTranslations, createTranslator, normalizeLocale } from '../apps/web/src/localization.js';
import { createCostDashboardViewModel } from '../apps/web/src/cost-dashboard.js';
import { describeRoutingChoice } from '../apps/web/src/model-routing.js';
import { createSyncDashboardViewModel } from '../apps/web/src/sync-dashboard.js';
import { createInitialWebState, parseState, serializeState, setLocale } from '../apps/web/src/web-state.js';

test('localization translates known keys and falls back to English for unknown locales', () => {
  assert.equal(normalizeLocale('zh'), 'zh');
  assert.equal(normalizeLocale('bad'), 'en');
  assert.equal(createTranslator('zh')('settings.title'), '设置');
  assert.equal(createTranslator('zh')('composer.send'), '发送');
  assert.equal(createTranslator('bad')('settings.title'), 'Settings');
  assert.equal(createTranslator('en')('usage.tokens', { count: 42 }), '42 tokens');
});

test('localization applies text, placeholders, aria labels, document lang, and leading labels', () => {
  const root = createFakeRoot([
    fakeElement({ dataset: { i18n: 'settings.title' } }),
    fakeElement({ dataset: { i18nPlaceholder: 'composer.placeholder' } }),
    fakeElement({ dataset: { i18nAriaLabel: 'chat.aria' } }),
    fakeElement({ dataset: { i18nLabel: 'field.name' }, childText: 'Name ' }),
  ]);

  const t = applyTranslations(root, 'zh');

  assert.equal(root.documentElement.lang, 'zh-CN');
  assert.equal(root.elements[0].textContent, '设置');
  assert.equal(root.elements[1].attributes.placeholder, '给 hello-world 发消息...');
  assert.equal(root.elements[2].attributes['aria-label'], '聊天');
  assert.equal(root.elements[3].childNodes[0].nodeValue, '名称 ');
  assert.equal(t('language.saved'), '语言已切换为中文。');
});

test('web state persists and normalizes the selected locale', () => {
  const state = setLocale(createInitialWebState('2026-05-02T10:00:00.000Z'), 'zh');
  const restored = parseState(serializeState(state));
  const invalid = parseState(JSON.stringify({ ...restored, locale: 'fr' }));

  assert.equal(restored.locale, 'zh');
  assert.equal(invalid.locale, 'en');
  assert.equal(setLocale(restored, 'en').locale, 'en');
});

test('localization translates dynamic dashboard summaries', () => {
  const t = createTranslator('zh');
  const routing = describeRoutingChoice({
    provider: { name: 'Local Ollama' },
    modelId: 'llama3.2',
    reasons: ['balanced priority'],
  }, { t });
  const cost = createCostDashboardViewModel([], {
    currency: 'CNY',
    now: '2026-05-02T10:00:00.000Z',
  }, { t });
  const sync = createSyncDashboardViewModel({ enabled: false }, {
    upload: [{ key: 'settings:app' }],
    download: [],
    conflicts: [],
    checkedAt: '2026-05-02T10:00:00.000Z',
    safeToAutoApply: true,
  }, { t });

  assert.equal(routing, '已选择 Local Ollama / llama3.2（均衡优先级）。');
  assert.match(cost.budgetMessage, /预算正常/);
  assert.equal(sync.enabledLabel, '仅本地');
  assert.match(sync.statusLabel, /1 个上传/);
});

function createFakeRoot(elements) {
  return {
    elements,
    documentElement: { lang: 'en' },
    querySelectorAll: (selector) => elements.filter((element) => matchesSelector(element, selector)),
  };
}

function matchesSelector(element, selector) {
  if (selector === '[data-i18n]') return element.dataset.i18n !== undefined;
  if (selector === '[data-i18n-placeholder]') return element.dataset.i18nPlaceholder !== undefined;
  if (selector === '[data-i18n-aria-label]') return element.dataset.i18nAriaLabel !== undefined;
  if (selector === '[data-i18n-label]') return element.dataset.i18nLabel !== undefined;
  return false;
}

function fakeElement({ dataset = {}, childText } = {}) {
  const element = {
    dataset,
    attributes: {},
    textContent: '',
    childNodes: childText === undefined ? [] : [{ nodeType: 3, nodeValue: childText }],
    ownerDocument: {
      createTextNode: (nodeValue) => ({ nodeType: 3, nodeValue }),
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    insertBefore(node) {
      this.childNodes.unshift(node);
    },
  };
  return element;
}
