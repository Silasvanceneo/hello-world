import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const indexPath = new URL('../apps/web/index.html', import.meta.url);
const runtimePath = new URL('../apps/web/src/runtime.js', import.meta.url);
const localizationPath = new URL('../apps/web/src/localization.js', import.meta.url);

test('provider settings expose explicit cloud model refresh controls', async () => {
  const html = await readFile(indexPath, 'utf8');

  assert.match(html, /id="refresh-provider-models"/);
  assert.match(html, /data-i18n="provider\.refreshModels"/);
  assert.match(html, /id="provider-model-options"/);
  assert.match(html, /list="provider-model-options"/);
});

test('runtime refreshes provider models into a selectable datalist', async () => {
  const source = await readFile(runtimePath, 'utf8');

  assert.match(source, /elements\.refreshProviderModels\.addEventListener\('click'/);
  assert.match(source, /async function refreshProviderModels\(provider\)/);
  assert.match(source, /validateProviderInBrowser\(provider/);
  assert.match(source, /renderProviderModelOptions\(models\)/);
  assert.match(source, /providerModelOptions\.innerHTML/);
  assert.match(source, /desktopProviderFetch/);
});

test('provider model refresh strings are bilingual', async () => {
  const source = await readFile(localizationPath, 'utf8');

  assert.match(source, /'provider\.refreshModels': 'Refresh models'/);
  assert.match(source, /'provider\.modelsRefreshing': 'Refreshing provider model list\.\.\.'/);
  assert.match(source, /'provider\.refreshModels': '拉取模型'/);
  assert.match(source, /'provider\.modelsRefreshing': '正在拉取供应商模型列表\.\.\.'/);
});
