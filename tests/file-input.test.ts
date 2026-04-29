import assert from 'node:assert/strict';
import test from 'node:test';
import { attachFileToSession, describeUnsupportedFileForModel, detectFileKind, parseFileInput, removeFileFromSession } from '../packages/core/src/files/file-input.ts';
import { textOnlyModelCapability, type ChatSession } from '@hello-world/shared';

function session(): ChatSession {
  return { id: 'session-1', title: 'Files', messages: [], tags: [], createdAt: '2026-04-29T00:00:00.000Z', updatedAt: '2026-04-29T00:00:00.000Z', syncState: 'local' };
}

test('file kind detection supports P0 file types', () => {
  assert.equal(detectFileKind('note.txt', 'text/plain'), 'text');
  assert.equal(detectFileKind('README.md', 'text/markdown'), 'markdown');
  assert.equal(detectFileKind('paper.pdf', 'application/pdf'), 'pdf');
  assert.equal(detectFileKind('image.png', 'image/png'), 'image');
  assert.equal(detectFileKind('archive.zip', 'application/zip'), 'unsupported');
});

test('text and markdown files parse to text attachments', () => {
  const text = parseFileInput({ name: 'note.txt', mimeType: 'text/plain', data: 'hello text' }, { now: () => '2026-04-29T00:00:00.000Z', createId: () => 'file-1' });
  const markdown = parseFileInput({ name: 'README.md', mimeType: 'text/markdown', data: '# hello' }, { now: () => '2026-04-29T00:00:00.000Z', createId: () => 'file-2' });

  assert.equal(text.ok && text.attachment.text, 'hello text');
  assert.equal(markdown.ok && markdown.attachment.kind, 'markdown');
});

test('basic PDF text extraction handles simple text-layer PDFs', () => {
  const pdf = '%PDF-1.4\nBT\n(Hello PDF) Tj\n[( more) ( text)] TJ\nET\n%%EOF';
  const parsed = parseFileInput({ name: 'paper.pdf', mimeType: 'application/pdf', data: pdf }, { now: () => '2026-04-29T00:00:00.000Z', createId: () => 'file-pdf' });

  assert.equal(parsed.ok && parsed.attachment.kind, 'pdf');
  assert.equal(parsed.ok && parsed.attachment.text, 'Hello PDF\n more\n text');
});

test('image files become data-url attachments and can be attached/removed from a session', () => {
  const parsed = parseFileInput({ name: 'image.png', mimeType: 'image/png', data: new Uint8Array([137, 80, 78, 71]) }, { now: () => '2026-04-29T00:00:00.000Z', createId: () => 'file-image' });
  assert.equal(parsed.ok && parsed.attachment.dataUrl?.startsWith('data:image/png;base64,'), true);

  if (!parsed.ok) {
    throw new Error('image parse failed');
  }

  const withFile = attachFileToSession(session(), parsed.attachment, '2026-04-29T01:00:00.000Z');
  assert.equal(withFile.attachments?.length, 1);
  const removed = removeFileFromSession(withFile, 'file-image', '2026-04-29T02:00:00.000Z');
  assert.deepEqual(removed.attachments, []);
});

test('unsupported file/model combinations produce user-readable guidance', () => {
  const parsed = parseFileInput({ name: 'note.txt', mimeType: 'text/plain', data: 'hello text' }, { createId: () => 'file-1' });
  if (!parsed.ok) {
    throw new Error('text parse failed');
  }

  assert.match(describeUnsupportedFileForModel(textOnlyModelCapability, parsed.attachment) ?? '', /does not support file input/);
});
