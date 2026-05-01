import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionListViewModel, renderSessionListItems } from '../apps/web/src/session-organizer.js';

test('session organizer filters archived chats and sorts pinned sessions first', () => {
  const view = createSessionListViewModel([
    session({ id: 'older', title: 'Older chat', updatedAt: '2026-05-01T00:00:00.000Z' }),
    session({ id: 'pinned', title: 'Pinned chat', pinned: true, updatedAt: '2026-04-30T00:00:00.000Z' }),
    session({ id: 'archived', title: 'Archived chat', archived: true, updatedAt: '2026-05-02T00:00:00.000Z' }),
    session({ id: 'trash', title: 'Deleted chat', deletedAt: '2026-05-04T00:00:00.000Z' }),
    session({ id: 'recent', title: 'Recent chat', updatedAt: '2026-05-03T00:00:00.000Z' }),
  ], { activeSessionId: 'recent', archiveFilter: 'active' });

  assert.deepEqual(view.items.map((item) => item.id), ['pinned', 'recent', 'older']);
  assert.equal(view.counts.active, 3);
  assert.equal(view.counts.archived, 1);
  assert.equal(view.counts.deleted, 1);
  assert.equal(view.items[1].active, true);
});

test('session organizer exposes deleted conversations only in trash scope', () => {
  const view = createSessionListViewModel([
    session({ id: 'active', title: 'Active chat' }),
    session({ id: 'trash', title: 'Deleted chat', deletedAt: '2026-05-04T00:00:00.000Z' }),
  ], { archiveFilter: 'deleted' });

  assert.deepEqual(view.items.map((item) => item.id), ['trash']);
  assert.equal(view.items[0]?.deleted, true);
});

test('session organizer searches title, tags, and message text', () => {
  const view = createSessionListViewModel([
    session({ id: 'notes', title: 'Weekly notes', tags: ['work'] }),
    session({ id: 'research', title: 'Ideas', tags: ['reading'], messageText: 'Summarize vector databases' }),
    session({ id: 'archive', title: 'Old prompt', tags: ['work'], archived: true }),
  ], { query: 'vector', tag: 'reading', archiveFilter: 'all' });

  assert.deepEqual(view.items.map((item) => item.id), ['research']);
  assert.deepEqual(view.availableTags, ['reading', 'work']);
  assert.equal(view.counts.total, 3);
});

test('session organizer escapes rendered labels', () => {
  const view = createSessionListViewModel([
    session({ id: 'safe', title: '<img src=x onerror=alert(1)>', tags: ['a&b'] }),
  ], { archiveFilter: 'all' });
  const html = renderSessionListItems(view);

  assert.equal(html.includes('<img src=x'), false);
  assert.match(html, /&lt;img src=x/);
  assert.match(html, /a&amp;b/);
});

function session(overrides = {}) {
  return {
    id: overrides.id ?? 'session',
    title: overrides.title ?? 'Untitled chat',
    tags: overrides.tags ?? [],
    pinned: Boolean(overrides.pinned),
    archived: Boolean(overrides.archived),
    deletedAt: overrides.deletedAt,
    messages: overrides.messageText
      ? [{ role: 'user', content: [{ type: 'text', text: overrides.messageText }] }]
      : [],
    attachments: [],
    createdAt: overrides.createdAt ?? '2026-05-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-05-01T00:00:00.000Z',
    syncState: 'synced',
  };
}
