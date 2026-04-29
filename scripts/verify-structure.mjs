import { existsSync } from 'node:fs';

const requiredPaths = [
  'apps/web/src/main.ts',
  'apps/desktop/src-tauri/.gitkeep',
  'apps/mobile/capacitor.config.ts',
  'packages/shared/src/types/chat.ts',
  'packages/shared/src/types/provider.ts',
  'packages/api-client/src/provider-adapter.ts',
  'packages/core/src/chat/chat-store.ts',
  'packages/storage/src/storage-adapter.ts',
  'packages/ui/src/index.ts',
  'server/open_webui/README.md',
  'docs/TARGET_ARCHITECTURE.md',
  'docs/SECURITY_MODEL.md',
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

console.log(`hello-world scaffold check passed (${requiredPaths.length} paths).`);
