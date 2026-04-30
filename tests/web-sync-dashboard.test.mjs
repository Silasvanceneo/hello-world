import assert from 'node:assert/strict';
import test from 'node:test';
import { createLocalPreviewPlan, createSyncDashboardViewModel, parseSyncTargets } from '../apps/web/src/sync-dashboard.js';
import {
  createInitialWebState,
  parseState,
  saveSyncSettings,
  serializeState,
} from '../apps/web/src/web-state.js';

test('web sync settings persist safe local-first scopes without secrets', () => {
  const state = saveSyncSettings(createInitialWebState('2026-04-30T00:00:00.000Z'), {
    enabled: true,
    endpoint: ' https://sync.example.invalid/workspaces/main ',
    targets: 'chats, settings, prompts, agents, knowledge-metadata, unknown',
    accessToken: 'dummy-token-value',
  });
  const restored = parseState(serializeState(state));
  const serializedSettings = JSON.stringify(restored.syncSettings);

  assert.equal(restored.syncSettings.enabled, true);
  assert.equal(restored.syncSettings.endpoint, 'https://sync.example.invalid/workspaces/main');
  assert.equal(restored.syncSettings.includeChats, true);
  assert.equal(restored.syncSettings.includeSettings, true);
  assert.equal(restored.syncSettings.includePrompts, true);
  assert.equal(restored.syncSettings.includeAgents, true);
  assert.equal(restored.syncSettings.includeKnowledgeMetadata, true);
  assert.equal(serializedSettings.includes('dummy-token-value'), false);
});

test('web sync dashboard surfaces sync counts and conflicts', () => {
  const view = createSyncDashboardViewModel({
    enabled: true,
    endpoint: 'https://sync.example.invalid',
    includeChats: true,
    includeSettings: true,
    includePrompts: true,
    includeAgents: true,
    includeKnowledgeMetadata: true,
  }, {
    upload: [{ key: 'session:s1' }],
    download: [{ key: 'prompt:t1' }],
    conflicts: [{ key: 'agent:a1' }],
    checkedAt: '2026-04-30T13:00:00.000Z',
    safeToAutoApply: false,
  });

  assert.equal(view.enabledLabel, 'Enabled');
  assert.deepEqual(view.counts, { upload: 1, download: 1, conflicts: 1 });
  assert.equal(view.canAutoApply, false);
  assert.match(view.statusLabel, /1 conflict/);
});

test('sync target parser ignores unknown scopes and keeps stable ordering', () => {
  assert.deepEqual(parseSyncTargets('knowledge-metadata, chats, agents, custom, settings'), [
    'chats',
    'settings',
    'agents',
    'knowledge-metadata',
  ]);
});

test('local preview includes app settings and dirty chats before any network sync', () => {
  const plan = createLocalPreviewPlan(createInitialWebState('2026-04-30T00:00:00.000Z'), '2026-04-30T13:00:00.000Z');

  assert.deepEqual(plan.upload.map((item) => item.key), ['settings:app', 'session:session-1']);
  assert.equal(plan.safeToAutoApply, true);
});
