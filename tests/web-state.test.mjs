import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addAttachmentToActiveSession,
  addMessageToActiveSession,
  addSession,
  createAgentPresetFromForm,
  createAssistantEchoMessage,
  createInitialWebState,
  createProviderFromForm,
  createProviderMessagesForActiveAgent,
  createSession,
  createTextMessage,
  getActiveAgentPreset,
  getActiveSession,
  parseState,
  serializeState,
  setActiveAgentPreset,
  summarizeUsage,
  upsertAgentPreset,
  upsertProvider,
} from '../apps/web/src/web-state.js';

test('web state creates sessions and appends chat messages immutably', () => {
  const state = createInitialWebState('2026-04-29T00:00:00.000Z');
  const session = createSession('session-2', '2026-04-29T01:00:00.000Z');
  const withSession = addSession(state, session);
  const withUser = addMessageToActiveSession(withSession, createTextMessage('user', 'Hello world', '2026-04-29T02:00:00.000Z', 'msg-1'));
  const withAssistant = addMessageToActiveSession(withUser, createAssistantEchoMessage('Hello world', '2026-04-29T02:00:01.000Z', 'msg-2'));

  assert.equal(state.sessions.length, 1);
  assert.equal(getActiveSession(withAssistant).messages.length, 2);
  assert.equal(getActiveSession(withAssistant).title, 'Hello world');
  assert.equal(summarizeUsage(getActiveSession(withAssistant)).totalTokens, 5);
});

test('web state stores providers and attachments then survives serialization', () => {
  let state = createInitialWebState('2026-04-29T00:00:00.000Z');
  state = upsertProvider(state, createProviderFromForm({ name: '  Local Ollama ', type: 'ollama', baseUrl: ' http://127.0.0.1:11434 ', apiKey: '' }, '2026-04-29T00:00:00.000Z', 'provider-1'));
  state = addAttachmentToActiveSession(state, { id: 'file-1', kind: 'text', name: 'note.txt', mimeType: 'text/plain', sizeBytes: 5, createdAt: '2026-04-29T00:00:00.000Z' });
  const restored = parseState(serializeState(state));

  assert.equal(restored.providers[0]?.name, 'Local Ollama');
  assert.equal(restored.providers[0]?.apiKeyRef, undefined);
  assert.equal(getActiveSession(restored).attachments.length, 1);
});

test('web state stores active agent presets and prepends system prompts for providers', () => {
  let state = createInitialWebState('2026-04-30T00:00:00.000Z');
  state = addMessageToActiveSession(state, createTextMessage('user', 'Summarize this', '2026-04-30T00:01:00.000Z', 'msg-1'));
  const preset = createAgentPresetFromForm({
    name: '  Analyst  ',
    systemPrompt: '  Answer with crisp bullets.  ',
    defaultModelId: ' gpt-4.1-mini ',
    enabledTools: 'file-attachments, vision-input, file-attachments',
    knowledgeBase: 'library',
    icon: ' ◎ ',
  }, '2026-04-30T00:02:00.000Z', 'agent-1');
  state = upsertAgentPreset(state, preset);
  state = setActiveAgentPreset(state, 'agent-1');
  const restored = parseState(serializeState(state));
  const active = getActiveAgentPreset(restored);
  const providerMessages = createProviderMessagesForActiveAgent(restored, getActiveSession(restored));

  assert.equal(active.name, 'Analyst');
  assert.equal(active.defaultModelId, 'gpt-4.1-mini');
  assert.deepEqual(active.enabledTools, ['file-attachments', 'vision-input']);
  assert.equal(active.knowledgeBase.scope, 'library');
  assert.equal(providerMessages[0].role, 'system');
  assert.equal(providerMessages[0].content, 'Answer with crisp bullets.');
  assert.equal(providerMessages[1].content, 'Summarize this');
});

test('web state falls back safely when persisted state is invalid', () => {
  const restored = parseState('{bad json', '2026-04-29T00:00:00.000Z');
  assert.equal(restored.sessions.length, 1);
  assert.equal(getActiveSession(restored).title, 'Untitled chat');
});
