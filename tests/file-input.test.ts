import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateRawSync } from 'node:zlib';
import { attachFileToSession, describeUnsupportedFileForModel, detectFileKind, parseFileInput, removeFileFromSession } from '../packages/core/src/files/file-input.ts';
import { textOnlyModelCapability, type ChatSession } from '@hello-world/shared';

function session(): ChatSession {
  return { id: 'session-1', title: 'Files', messages: [], tags: [], createdAt: '2026-04-29T00:00:00.000Z', updatedAt: '2026-04-29T00:00:00.000Z', syncState: 'local' };
}

test('file kind detection supports P0 and P1 file types', () => {
  assert.equal(detectFileKind('note.txt', 'text/plain'), 'text');
  assert.equal(detectFileKind('README.md', 'text/markdown'), 'markdown');
  assert.equal(detectFileKind('paper.pdf', 'application/pdf'), 'pdf');
  assert.equal(detectFileKind('brief.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), 'docx');
  assert.equal(detectFileKind('sheet.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), 'xlsx');
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

test('PDF parsing keeps basic page references for citations', () => {
  const pdf = [
    '%PDF-1.4',
    '1 0 obj << /Type /Page >> stream BT (First page) Tj ET endstream endobj',
    '2 0 obj << /Type /Page >> stream BT (Second page) Tj ET endstream endobj',
    '%%EOF',
  ].join('\n');
  const parsed = parseFileInput({ name: 'manual.pdf', mimeType: 'application/pdf', data: pdf }, { createId: () => 'file-pdf' });

  assert.equal(parsed.ok && parsed.attachment.pageTexts?.length, 2);
  assert.equal(parsed.ok && parsed.attachment.pageTexts?.[1]?.text, 'Second page');
});

test('DOCX and XLSX files have dependency-free basic text extraction', () => {
  const docx = createZip({
    'word/document.xml': '<w:document><w:body><w:p><w:t>Hello DOCX</w:t></w:p><w:p><w:t>Second paragraph</w:t></w:p></w:body></w:document>',
  });
  const xlsx = createZip({
    'xl/sharedStrings.xml': '<sst><si><t>Name</t></si><si><t>Ada</t></si></sst>',
    'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row><c t="s"><v>0</v></c><c t="s"><v>1</v></c></row><row><c><v>42</v></c></row></sheetData></worksheet>',
  });

  const parsedDocx = parseFileInput({ name: 'brief.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', data: docx }, { createId: () => 'docx-1' });
  const parsedXlsx = parseFileInput({ name: 'sheet.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', data: xlsx }, { createId: () => 'xlsx-1' });

  assert.match(parsedDocx.ok ? parsedDocx.attachment.text ?? '' : '', /Hello DOCX/);
  assert.match(parsedXlsx.ok ? parsedXlsx.attachment.text ?? '' : '', /Name\tAda/);
  assert.match(parsedXlsx.ok ? parsedXlsx.attachment.text ?? '' : '', /42/);
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

function createZip(entries: Record<string, string>): Uint8Array {
  return Buffer.concat(Object.entries(entries).map(([name, content]) => {
    const nameBytes = Buffer.from(name);
    const raw = Buffer.from(content);
    const compressed = deflateRawSync(raw);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(8, 8);
    header.writeUInt32LE(0, 10);
    header.writeUInt32LE(0, 14);
    header.writeUInt32LE(compressed.byteLength, 18);
    header.writeUInt32LE(raw.byteLength, 22);
    header.writeUInt16LE(nameBytes.byteLength, 26);
    header.writeUInt16LE(0, 28);
    return Buffer.concat([header, nameBytes, compressed]);
  }));
}
