import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const mainSourcePath = new URL('../apps/desktop/src-tauri/src/main.rs', import.meta.url);

test('desktop Tauri command allowlist exposes no terminal or shell execution command', async () => {
  const source = await readFile(mainSourcePath, 'utf8');
  const match = source.match(/generate_handler!\[\s*([\s\S]*?)\s*\]/);
  assert(match, 'Tauri generate_handler! command allowlist should be present');

  const commands = match[1]
    .split(',')
    .map((command) => command.trim())
    .filter(Boolean);

  assert.deepEqual(commands, [
    'desktop_native_capabilities',
    'detect_local_ollama',
    'save_desktop_provider_secret',
    'read_desktop_provider_secret',
    'delete_desktop_provider_secret',
  ]);
  assert(commands.every((command) => !/terminal|shell|exec|process|command|spawn/i.test(command)));
});

test('desktop Rust source does not import process execution APIs', async () => {
  const source = await readFile(mainSourcePath, 'utf8');

  assert.equal(/\bstd::process\b/.test(source), false);
  assert.equal(/\bCommand::new\b/.test(source), false);
});
