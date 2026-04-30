import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createWebBackupArchive,
  exportActiveSessionMarkdown,
  restoreWebBackupArchive,
  summarizeBackupArchive,
} from '../apps/web/src/backup-dashboard.js';
import {
  addMessageToActiveSession,
  createInitialWebState,
  createProviderFromForm,
  createTextMessage,
  getActiveSession,
  upsertProvider,
} from '../apps/web/src/web-state.js';

test('web backup archive excludes runtime provider secret references', () => {
  let state = createInitialWebState('2026-04-30T00:00:00.000Z');
  state = upsertProvider(state, createProviderFromForm({
    name: 'Remote',
    type: 'openai-compatible',
    baseUrl: 'https://example.invalid',
    apiKey: 'dummy-runtime-key',
  }, '2026-04-30T00:00:00.000Z', 'provider-1'));
  const archive = createWebBackupArchive(state, '2026-04-30T01:00:00.000Z');

  assert.equal(archive.providers[0]?.apiKeyRef, undefined);
  assert.match(summarizeBackupArchive(archive), /1 session/);
});

test('web backup restore replaces local state with imported archive safely', () => {
  const state = createInitialWebState('2026-04-30T00:00:00.000Z');
  const archive = createWebBackupArchive({
    ...state,
    sessions: [{ ...getActiveSession(state), id: 'imported', title: 'Imported chat' }],
  }, '2026-04-30T01:00:00.000Z');
  const restored = restoreWebBackupArchive(state, JSON.stringify(archive));

  assert.equal(restored.activeSessionId, 'imported');
  assert.equal(getActiveSession(restored).title, 'Imported chat');
});

test('web exports active session markdown with redaction', () => {
  let state = createInitialWebState('2026-04-30T00:00:00.000Z');
  state = addMessageToActiveSession(state, createTextMessage('user', `Use ${'api_key'}=runtime-secret-value`, '2026-04-30T00:01:00.000Z', 'm1'));
  const markdown = exportActiveSessionMarkdown(state);

  assert.match(markdown, /^# Use api_key=\?\?\?\?/);
  assert.match(markdown, /api_key=\?\?\?\?/);
  assert.equal(markdown.includes('runtime-secret-value'), false);
});
