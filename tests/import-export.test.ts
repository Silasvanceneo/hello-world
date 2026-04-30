import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createBackupArchive,
  exportSessionMarkdown,
  importChatGPTExport,
  importOpenWebUIExport,
  restoreBackupArchive,
} from '../packages/core/src/backup/import-export.ts';
import type { ChatSession, ProviderConnection } from '@hello-world/shared';

const base = '2026-04-30T10:00:00.000Z';

function session(): ChatSession {
  return {
    id: 's1',
    title: 'Planning chat',
    messages: [
      { id: 'u1', role: 'user', content: [{ type: 'text', text: `Use ${'api_key'}=runtime-secret-value` }], createdAt: base, updatedAt: base },
      { id: 'a1', role: 'assistant', content: [{ type: 'text', text: 'Use local-first backup.' }], createdAt: base, updatedAt: base },
    ],
    tags: ['backup'],
    createdAt: base,
    updatedAt: base,
    syncState: 'dirty',
  };
}

test('exports one chat session to redacted markdown', () => {
  const markdown = exportSessionMarkdown(session());

  assert.match(markdown, /^# Planning chat/);
  assert.match(markdown, /## User/);
  assert.match(markdown, /api_key=\?\?\?\?/);
  assert.match(markdown, /Use local-first backup/);
  assert.equal(markdown.includes('runtime-secret-value'), false);
});

test('creates and restores a JSON backup without provider secret references', () => {
  const provider: ProviderConnection = {
    id: 'p1',
    type: 'openai-compatible',
    name: 'Remote',
    baseUrl: 'https://example.invalid',
    apiKeyRef: 'local:p1',
    enabled: true,
    createdAt: base,
    updatedAt: base,
  };
  const archive = createBackupArchive({
    sessions: [session()],
    providers: [provider],
    settings: { theme: 'system', language: 'system', updatedAt: base },
    promptTemplates: [{ id: 't1', title: 'T', body: 'Hi', variables: [], tags: [], favorite: false, scope: 'sync', createdAt: base, updatedAt: base }],
    agentPresets: [{ id: 'a1', name: 'Agent', systemPrompt: 'Help', enabledTools: [], knowledgeBase: { scope: 'none', documentIds: [] }, icon: '◯', createdAt: base, updatedAt: base }],
  }, { exportedAt: '2026-04-30T11:00:00.000Z' });
  const restored = restoreBackupArchive(JSON.stringify(archive));

  assert.equal(archive.version, 1);
  assert.equal(archive.providers[0]?.apiKeyRef, undefined);
  assert.equal(restored.sessions[0]?.title, 'Planning chat');
  assert.equal(restored.promptTemplates[0]?.scope, 'sync');
  assert.equal(restored.agentPresets[0]?.name, 'Agent');
});

test('imports ChatGPT and Open WebUI exports into normalized sessions', () => {
  const chatGpt = importChatGPTExport([
    {
      id: 'chatgpt-1',
      title: 'ChatGPT export',
      create_time: 1777473133,
      mapping: {
        m1: { message: { author: { role: 'user' }, content: { parts: ['Hello'] }, create_time: 1777473133 } },
        m2: { message: { author: { role: 'assistant' }, content: { parts: ['Hi there'] }, create_time: 1777473134 } },
      },
    },
  ], { importedAt: base });
  const openWebUi = importOpenWebUIExport({
    chats: [{
      id: 'owui-1',
      title: 'Open WebUI export',
      chat: { messages: [{ id: 'u1', role: 'user', content: 'Question' }, { id: 'a1', role: 'assistant', content: 'Answer' }] },
      updated_at: base,
    }],
  }, { importedAt: base });

  assert.equal(chatGpt[0]?.messages.map((message) => message.role).join(','), 'user,assistant');
  assert.equal(chatGpt[0]?.syncState, 'dirty');
  assert.equal(openWebUi[0]?.messages[1]?.content[0]?.type, 'text');
  assert.equal(openWebUi[0]?.messages[1]?.content[0]?.text, 'Answer');
});
