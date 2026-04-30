import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAgentRuntimeMessages,
  createAgentPreset,
  deleteAgentPreset,
  upsertAgentPreset,
} from '../packages/core/src/agent/agent-preset.ts';
import type { ChatMessage } from '@hello-world/shared';

const now = '2026-04-30T08:00:00.000Z';

test('agent presets normalize fields and keep tool choices deterministic', () => {
  const preset = createAgentPreset({
    name: '  Research editor  ',
    systemPrompt: '  Be precise and cite local knowledge.  ',
    defaultModelId: '  gpt-4.1-mini  ',
    enabledTools: ['file-attachments', 'vision-input', 'file-attachments', 'unknown-tool'],
    knowledgeBase: { scope: 'library', documentIds: ['doc-2', '', 'doc-1', 'doc-2'] },
    icon: '  ◯  ',
  }, { id: 'agent-1', now: () => now });

  assert.equal(preset.id, 'agent-1');
  assert.equal(preset.name, 'Research editor');
  assert.equal(preset.systemPrompt, 'Be precise and cite local knowledge.');
  assert.equal(preset.defaultModelId, 'gpt-4.1-mini');
  assert.deepEqual(preset.enabledTools, ['file-attachments', 'vision-input']);
  assert.deepEqual(preset.knowledgeBase, { scope: 'library', documentIds: ['doc-2', 'doc-1'] });
  assert.equal(preset.icon, '◯');
  assert.equal(preset.createdAt, now);
  assert.equal(preset.updatedAt, now);
});

test('agent preset collection operations are immutable', () => {
  const first = createAgentPreset({ name: 'Writer', systemPrompt: 'Draft clearly.' }, { id: 'agent-1', now: () => now });
  const updated = { ...first, name: 'Senior writer', updatedAt: '2026-04-30T09:00:00.000Z' };
  const inserted = upsertAgentPreset([], first);
  const replaced = upsertAgentPreset(inserted, updated);
  const deleted = deleteAgentPreset(replaced, 'agent-1');

  assert.deepEqual(inserted.map((item) => item.name), ['Writer']);
  assert.deepEqual(replaced.map((item) => item.name), ['Senior writer']);
  assert.deepEqual(deleted, []);
});

test('agent runtime messages prepend the system prompt without mutating chat history', () => {
  const preset = createAgentPreset({ name: 'Tutor', systemPrompt: 'Teach step by step.' }, { id: 'agent-1', now: () => now });
  const message: ChatMessage = {
    id: 'msg-1',
    role: 'user',
    content: [{ type: 'text', text: 'Explain entropy.' }],
    createdAt: now,
    updatedAt: now,
  };

  const runtimeMessages = buildAgentRuntimeMessages(preset, [message]);

  assert.deepEqual(runtimeMessages, [
    { role: 'system', content: 'Teach step by step.' },
    { role: 'user', content: 'Explain entropy.' },
  ]);
  assert.equal(message.content[0].type, 'text');
});
