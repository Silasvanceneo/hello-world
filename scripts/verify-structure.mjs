import { existsSync, readFileSync } from 'node:fs';

const requiredPaths = [
  'apps/web/src/main.ts',
  'apps/web/src/provider-settings.ts',
  'apps/desktop/src-tauri/.gitkeep',
  'apps/mobile/capacitor.config.ts',
  'packages/shared/src/types/chat.ts',
  'packages/shared/src/types/provider.ts',
  'packages/api-client/src/provider-adapter.ts',
  'packages/api-client/src/adapters/openai-compatible.ts',
  'packages/api-client/src/adapters/ollama.ts',
  'packages/api-client/src/registry.ts',
  'packages/api-client/src/streaming/openai-sse.ts',
  'packages/api-client/src/streaming/ollama-ndjson.ts',
  'packages/core/src/chat/chat-engine.ts',
  'packages/core/src/chat/chat-persistence.ts',
  'tests/chat-core.test.ts',
  'packages/core/src/chat/chat-store.ts',
  'packages/core/src/provider/provider-store.ts',
  'packages/storage/src/storage-adapter.ts',
  'packages/storage/src/indexeddb-storage-adapter.ts',
  'packages/storage/src/json-file-storage-adapter.ts',
  'packages/storage/src/key-value-storage-adapter.ts',
  'packages/storage/src/mobile-storage-adapter.ts',
  'packages/shared/src/types/settings.ts',
  'tests/storage-adapters.test.ts',
  'packages/ui/src/index.ts',
  'server/open_webui/README.md',
  'docs/TARGET_ARCHITECTURE.md',
  'docs/SECURITY_MODEL.md',
  'docs/PROVIDER_ADAPTERS.md',
  'docs/STORAGE_MODEL.md',
  '.hello-world-harness/feature_list.json',
  '.hello-world-harness/sprint_plan.json',
];

const missing = requiredPaths.filter((path) => !existsSync(path));

if (missing.length > 0) {
  console.error('Missing required scaffold paths:');
  for (const path of missing) {
    console.error(`- ${path}`);
  }
  process.exit(1);
}

const providerDoc = readFileSync('docs/PROVIDER_ADAPTERS.md', 'utf8');
for (const expected of ['OpenAI-compatible', 'Ollama', 'apiKeyRef']) {
  if (!providerDoc.includes(expected)) {
    console.error(`Provider documentation is missing expected text: ${expected}`);
    process.exit(1);
  }
}

console.log(`hello-world scaffold check passed (${requiredPaths.length} paths).`);
