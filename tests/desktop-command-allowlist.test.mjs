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
    'run_sandboxed_code',
    'desktop_provider_fetch',
  ]);
  assert(commands.every((command) => !/terminal|shell|process|command|spawn/i.test(command)));
});

test('desktop Rust source does not import shell execution APIs', async () => {
  const source = await readFile(mainSourcePath, 'utf8');

  assert.equal(/powershell|cmd\.exe|\/bin\/sh/i.test(source), false);
  assert.equal(/Command::new\(\s*request/i.test(source), false);
  assert.equal(/Command::new\(\s*confirmation/i.test(source), false);
});

test('desktop controlled code runner does not expose arbitrary command fields', async () => {
  const source = await readFile(mainSourcePath, 'utf8');

  assert.match(source, /enum SandboxLanguage/);
  assert.match(source, /run_sandboxed_code/);
  assert.equal(/command\s*:\s*String/.test(source), false);
  assert.equal(/shell\s*:\s*String/.test(source), false);
  assert.equal(/powershell|cmd\.exe|\/bin\/sh/i.test(source), false);
});

test('desktop provider fetch is not an arbitrary network proxy', async () => {
  const source = await readFile(mainSourcePath, 'utf8');

  assert.match(source, /fn validate_provider_fetch_request/);
  assert.match(source, /Desktop provider fetch supports only GET and POST/);
  assert.match(source, /Provider URL must not include credentials/);
  assert.match(source, /Desktop provider fetch allows HTTPS endpoints/);
  assert.match(source, /25 MB limit/);
  assert.match(source, /fn is_allowed_provider_header/);
  assert.match(source, /redirect\(reqwest::redirect::Policy::none\(\)\)/);
});
