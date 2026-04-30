import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectSyncItems,
  createSyncPlan,
  resolveSyncConflict,
} from '../packages/core/src/sync/sync-engine.ts';

const base = '2026-04-30T10:00:00.000Z';

test('sync engine collects chat, settings, agent, prompt, and knowledge metadata items', () => {
  const items = collectSyncItems({
    sessions: [{ id: 's1', title: 'Chat', messages: [], tags: [], syncState: 'dirty', createdAt: base, updatedAt: base }],
    settings: { theme: 'system', language: 'system', updatedAt: base },
    providerConnections: [{ id: 'p1', type: 'ollama', name: 'Local', enabled: true, createdAt: base, updatedAt: base }],
    agentPresets: [{ id: 'a1', name: 'Agent', systemPrompt: 'Help', enabledTools: [], knowledgeBase: { scope: 'none', documentIds: [] }, icon: '◯', createdAt: base, updatedAt: base }],
    promptTemplates: [{ id: 't1', title: 'Prompt', body: 'Hi', variables: [], tags: [], favorite: false, scope: 'local', createdAt: base, updatedAt: base }],
    knowledgeDocuments: [{ id: 'k1', title: 'Doc', scope: 'library', text: 'hidden body', createdAt: base, updatedAt: base }],
  });

  assert.deepEqual(items.map((item) => item.key), [
    'agent:a1',
    'knowledge:k1',
    'prompt:t1',
    'provider:p1',
    'session:s1',
    'settings:app',
  ]);
  assert.equal(items.find((item) => item.key === 'knowledge:k1')?.payload.text, undefined);
});

test('sync engine creates upload, download, and visible conflict plans', () => {
  const local = [
    { key: 'session:local-new', target: 'session' as const, updatedAt: '2026-04-30T10:00:00.000Z', syncState: 'dirty' as const, payload: { id: 'local-new' } },
    { key: 'prompt:remote-new', target: 'prompt' as const, updatedAt: '2026-04-30T09:00:00.000Z', syncState: 'synced' as const, payload: { id: 'remote-new' } },
    { key: 'agent:both', target: 'agent' as const, updatedAt: '2026-04-30T11:00:00.000Z', syncState: 'dirty' as const, payload: { id: 'both', name: 'local' } },
  ];
  const remote = [
    { key: 'prompt:remote-new', target: 'prompt' as const, updatedAt: '2026-04-30T10:00:00.000Z', revision: 'r1', payload: { id: 'remote-new' } },
    { key: 'agent:both', target: 'agent' as const, updatedAt: '2026-04-30T12:00:00.000Z', revision: 'r2', payload: { id: 'both', name: 'remote' } },
  ];

  const plan = createSyncPlan(local, remote, { now: '2026-04-30T13:00:00.000Z' });

  assert.deepEqual(plan.upload.map((item) => item.key), ['session:local-new']);
  assert.deepEqual(plan.download.map((item) => item.key), ['prompt:remote-new']);
  assert.deepEqual(plan.conflicts.map((item) => item.key), ['agent:both']);
  assert.equal(plan.safeToAutoApply, false);
});

test('sync conflicts resolve explicitly without silent overwrite', () => {
  const conflict = {
    key: 'agent:both',
    target: 'agent' as const,
    local: { key: 'agent:both', target: 'agent' as const, updatedAt: '2026-04-30T11:00:00.000Z', syncState: 'dirty' as const, payload: { name: 'local' } },
    remote: { key: 'agent:both', target: 'agent' as const, updatedAt: '2026-04-30T12:00:00.000Z', revision: 'r2', payload: { name: 'remote' } },
    reason: 'local and remote changed after last sync',
  };

  assert.equal(resolveSyncConflict(conflict, 'keep-local').payload.name, 'local');
  assert.equal(resolveSyncConflict(conflict, 'use-remote').payload.name, 'remote');
});
