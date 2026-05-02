import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addAttachmentToActiveSession,
  addMessageToActiveSession,
  addSession,
  createAgentPresetFromForm,
  createAssistantEchoMessage,
  createBranchFromLastAssistant,
  createInitialWebState,
  createPromptTemplateFromForm,
  createProviderFromForm,
  createProviderMessagesForActiveAgent,
  createSession,
  createTextMessage,
  createMessageBranch,
  deleteSessionPermanently,
  getActiveAgentPreset,
  getActivePromptTemplate,
  getActiveSession,
  getSessionBranchView,
  createSessionMessageView,
  parseState,
  promoteActiveBranchToMain,
  renderPromptTemplateWithVariables,
  restoreSessionFromTrash,
  saveUsageBudget,
  serializeState,
  setActiveAgentPreset,
  setActiveSessionBranch,
  setActivePromptTemplate,
  setModelRoutingStrategy,
  moveActiveSessionToTrash,
  summarizeUsage,
  updateActiveSessionOrganization,
  upsertAgentPreset,
  upsertPromptTemplate,
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

test('web state stores prompt templates and renders variables for the composer', () => {
  let state = createInitialWebState('2026-04-30T00:00:00.000Z');
  const template = createPromptTemplateFromForm({
    title: '  Bug report  ',
    body: 'Debug {{ issue }} in {{ file }}.',
    variables: '',
    tags: 'debug, work, debug',
    favorite: true,
    scope: 'sync',
  }, '2026-04-30T00:03:00.000Z', 'template-1');
  state = upsertPromptTemplate(state, template);
  state = setActivePromptTemplate(state, 'template-1');
  const restored = parseState(serializeState(state));
  const active = getActivePromptTemplate(restored);
  const rendered = renderPromptTemplateWithVariables(active, { issue: 'startup crash' });

  assert.equal(active.title, 'Bug report');
  assert.deepEqual(active.variables, ['issue', 'file']);
  assert.deepEqual(active.tags, ['debug', 'work']);
  assert.equal(active.favorite, true);
  assert.equal(active.scope, 'sync');
  assert.equal(rendered.text, 'Debug startup crash in {{ file }}.');
  assert.deepEqual(rendered.missingVariables, ['file']);
});

test('web state falls back safely when persisted state is invalid', () => {
  const restored = parseState('{bad json', '2026-04-29T00:00:00.000Z');
  assert.equal(restored.sessions.length, 1);
  assert.equal(getActiveSession(restored).title, 'Untitled chat');
});

test('web state persists model routing strategy with safe fallback', () => {
  const state = setModelRoutingStrategy(createInitialWebState('2026-04-30T00:00:00.000Z'), 'privacy');
  const restored = parseState(serializeState(state));
  const invalid = parseState(JSON.stringify({ ...restored, routingStrategy: 'unknown-route' }));

  assert.equal(restored.routingStrategy, 'privacy');
  assert.equal(invalid.routingStrategy, 'balanced');
});

test('web state persists local budget settings with safe numeric parsing', () => {
  const state = saveUsageBudget(createInitialWebState('2026-04-30T00:00:00.000Z'), {
    dailyLimit: '0.25',
    monthlyLimit: '-1',
    currency: 'CNY',
  });
  const restored = parseState(serializeState(state));

  assert.equal(restored.usageBudget.dailyLimit, 0.25);
  assert.equal(restored.usageBudget.monthlyLimit, undefined);
  assert.equal(restored.usageBudget.currency, 'CNY');
});

test('web state persists active session organization metadata', () => {
  let state = createInitialWebState('2026-05-01T00:00:00.000Z');
  state = updateActiveSessionOrganization(state, {
    tags: 'research, work, research',
    pinned: true,
    archived: false,
  }, '2026-05-01T00:01:00.000Z');
  const restored = parseState(serializeState(state));
  const active = getActiveSession(restored);

  assert.deepEqual(active.tags, ['research', 'work']);
  assert.equal(active.pinned, true);
  assert.equal(active.archived, false);
  assert.equal(active.updatedAt, '2026-05-01T00:01:00.000Z');
  assert.equal(active.syncState, 'dirty');
});

test('web state moves sessions to trash, restores them, and deletes permanently', () => {
  let state = createInitialWebState('2026-05-02T00:00:00.000Z');
  state = addSession(state, createSession('session-2', '2026-05-02T00:01:00.000Z'));
  state = moveActiveSessionToTrash(state, '2026-05-02T00:02:00.000Z');

  assert.equal(state.activeSessionId, 'session-1');
  assert.equal(state.sessions.find((session) => session.id === 'session-2')?.deletedAt, '2026-05-02T00:02:00.000Z');
  assert.equal(state.sessions.find((session) => session.id === 'session-2')?.syncState, 'dirty');

  state = restoreSessionFromTrash(state, 'session-2', '2026-05-02T00:03:00.000Z');
  assert.equal(state.activeSessionId, 'session-2');
  assert.equal(getActiveSession(state).deletedAt, undefined);
  assert.equal(getActiveSession(state).updatedAt, '2026-05-02T00:03:00.000Z');

  state = moveActiveSessionToTrash(state, '2026-05-02T00:04:00.000Z');
  state = deleteSessionPermanently(state, 'session-2');
  assert.equal(state.sessions.some((session) => session.id === 'session-2'), false);
});

test('web state creates message branches without mutating the main timeline', () => {
  let state = createInitialWebState('2026-05-02T01:00:00.000Z');
  state = addMessageToActiveSession(state, createTextMessage('user', 'Draft a launch note', '2026-05-02T01:01:00.000Z', 'user-1'));
  state = addMessageToActiveSession(state, createTextMessage('assistant', 'Main answer', '2026-05-02T01:02:00.000Z', 'assistant-1'));
  state = createMessageBranch(state, {
    fromMessageId: 'assistant-1',
    title: 'Shorter version',
    messages: [createTextMessage('assistant', 'Short answer', '2026-05-02T01:03:00.000Z', 'assistant-branch')],
  }, '2026-05-02T01:04:00.000Z', 'branch-1');
  const session = getActiveSession(state);
  const view = getSessionBranchView(session);

  assert.equal(session.messages.length, 2);
  assert.equal(session.branches[0]?.id, 'branch-1');
  assert.equal(session.branches[0]?.fromMessageId, 'assistant-1');
  assert.equal(session.branches[0]?.messages[0]?.id, 'assistant-branch');
  assert.equal(session.syncState, 'dirty');
  assert.equal(view.branches[0]?.messageCount, 1);
  assert.equal(view.activeBranchId, undefined);
});

test('web state rejects branches from unknown source messages', () => {
  const state = createInitialWebState('2026-05-02T01:00:00.000Z');
  assert.throws(() => createMessageBranch(state, {
    fromMessageId: 'missing',
    title: 'Invalid',
    messages: [],
  }), /Branch source message not found/);
});

test('web state creates a branch from the latest assistant message', () => {
  let state = createInitialWebState('2026-05-02T01:00:00.000Z');
  state = addMessageToActiveSession(state, createTextMessage('user', 'Draft', '2026-05-02T01:01:00.000Z', 'user-1'));
  state = addMessageToActiveSession(state, createTextMessage('assistant', 'First answer', '2026-05-02T01:02:00.000Z', 'assistant-1'));
  state = createBranchFromLastAssistant(state, '2026-05-02T01:05:00.000Z', 'branch-last');
  const branch = getActiveSession(state).branches[0];

  assert.equal(branch.fromMessageId, 'assistant-1');
  assert.equal(branch.messages[0]?.id, 'branch-last:message');
  assert.deepEqual(branch.messages[0]?.content, [{ type: 'text', text: 'First answer' }]);
});

test('web state previews a branch timeline without mutating the main messages', () => {
  let state = createInitialWebState('2026-05-02T05:00:00.000Z');
  state = addMessageToActiveSession(state, createTextMessage('user', 'Draft', '2026-05-02T05:01:00.000Z', 'user-1'));
  state = addMessageToActiveSession(state, createTextMessage('assistant', 'Main answer', '2026-05-02T05:02:00.000Z', 'assistant-1'));
  state = createMessageBranch(state, {
    fromMessageId: 'assistant-1',
    title: 'Short option',
    messages: [createTextMessage('assistant', 'Short answer', '2026-05-02T05:03:00.000Z', 'assistant-branch')],
  }, '2026-05-02T05:04:00.000Z', 'branch-1');
  state = setActiveSessionBranch(state, 'branch-1', '2026-05-02T05:05:00.000Z');

  const session = getActiveSession(state);
  const view = createSessionMessageView(session);

  assert.equal(session.messages[1]?.id, 'assistant-1');
  assert.deepEqual(view.messages.map((message) => message.id), ['user-1', 'assistant-branch']);
  assert.equal(view.title, 'Draft / Short option');
  assert.equal(session.activeBranchId, 'branch-1');
  assert.equal(session.updatedAt, '2026-05-02T05:05:00.000Z');
});

test('web state promotes the active branch to the main timeline immutably', () => {
  let state = createInitialWebState('2026-05-02T05:00:00.000Z');
  state = addMessageToActiveSession(state, createTextMessage('user', 'Draft', '2026-05-02T05:01:00.000Z', 'user-1'));
  state = addMessageToActiveSession(state, createTextMessage('assistant', 'Main answer', '2026-05-02T05:02:00.000Z', 'assistant-1'));
  state = createMessageBranch(state, {
    fromMessageId: 'assistant-1',
    title: 'Short option',
    messages: [createTextMessage('assistant', 'Short answer', '2026-05-02T05:03:00.000Z', 'assistant-branch')],
  }, '2026-05-02T05:04:00.000Z', 'branch-1');
  const previewing = setActiveSessionBranch(state, 'branch-1', '2026-05-02T05:05:00.000Z');
  const promoted = promoteActiveBranchToMain(previewing, '2026-05-02T05:06:00.000Z');

  assert.deepEqual(getActiveSession(previewing).messages.map((message) => message.id), ['user-1', 'assistant-1']);
  assert.deepEqual(getActiveSession(promoted).messages.map((message) => message.id), ['user-1', 'assistant-branch']);
  assert.equal(getActiveSession(promoted).activeBranchId, undefined);
  assert.equal(getActiveSession(promoted).branches.length, 1);
  assert.equal(getActiveSession(promoted).syncState, 'dirty');
  assert.equal(getActiveSession(promoted).updatedAt, '2026-05-02T05:06:00.000Z');
});
