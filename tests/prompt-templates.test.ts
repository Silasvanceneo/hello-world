import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPromptTemplate,
  deletePromptTemplate,
  exportPromptTemplates,
  importPromptTemplates,
  renderPromptTemplate,
  upsertPromptTemplate,
} from '../packages/core/src/prompt/prompt-template.ts';

const now = '2026-04-30T09:00:00.000Z';

test('prompt templates normalize variables, tags, favorite, and scope', () => {
  const template = createPromptTemplate({
    title: '  Meeting summary  ',
    body: 'Summarize {{ topic }} for {{audience}}.',
    variables: ['topic', 'audience', 'topic', ''],
    tags: [' work ', 'summary', 'work'],
    favorite: true,
    scope: 'sync',
  }, { id: 'template-1', now: () => now });

  assert.equal(template.id, 'template-1');
  assert.equal(template.title, 'Meeting summary');
  assert.equal(template.body, 'Summarize {{ topic }} for {{audience}}.');
  assert.deepEqual(template.variables, ['topic', 'audience']);
  assert.deepEqual(template.tags, ['work', 'summary']);
  assert.equal(template.favorite, true);
  assert.equal(template.scope, 'sync');
});

test('prompt templates render variable values and report missing variables', () => {
  const template = createPromptTemplate({
    title: 'Explain',
    body: 'Explain {{ concept }} to {{ audience }}.',
  }, { id: 'template-1', now: () => now });

  const rendered = renderPromptTemplate(template, { concept: 'entropy' });

  assert.equal(rendered.text, 'Explain entropy to {{ audience }}.');
  assert.deepEqual(rendered.missingVariables, ['audience']);
});

test('prompt template collections and import/export are deterministic', () => {
  const first = createPromptTemplate({ title: 'A', body: 'One' }, { id: 'template-1', now: () => now });
  const updated = { ...first, title: 'A+', updatedAt: '2026-04-30T09:10:00.000Z' };
  const inserted = upsertPromptTemplate([], first);
  const replaced = upsertPromptTemplate(inserted, updated);
  const exported = exportPromptTemplates(replaced);
  const imported = importPromptTemplates(exported);
  const deleted = deletePromptTemplate(imported, 'template-1');

  assert.deepEqual(inserted.map((item) => item.title), ['A']);
  assert.deepEqual(imported.map((item) => item.title), ['A+']);
  assert.deepEqual(deleted, []);
});
