import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const requiredPaths = [
  'apps/web/src/main.ts',
  'apps/web/src/app.css',
  'apps/web/src/web-state.js',
  'apps/web/src/provider-runtime.js',
  'apps/web/src/cost-dashboard.js',
  'apps/web/src/model-capabilities.js',
  'apps/web/src/model-comparison.js',
  'apps/web/src/model-routing.js',
  'apps/web/src/native-desktop.js',
  'apps/web/src/native-media.js',
  'apps/web/src/native-voice.js',
  'apps/web/src/provider-diagnostics.js',
  'apps/web/src/runtime.js',
  'apps/web/src/pwa.ts',
  'apps/web/static/sw.js',
  'apps/web/static/brand-icon.png',
  'apps/web/static/manifest.webmanifest',
  'apps/web/index.html',
  'apps/web/src/provider-settings.ts',
  'apps/web/src/usage-dashboard.ts',
  'apps/web/src/security-settings.ts',
  'apps/desktop/src-tauri/.gitkeep',
  'apps/desktop/src-tauri/build.rs',
  'apps/desktop/src-tauri/icons/icon.ico',
  'apps/desktop/src-tauri/src/main.rs',
  'apps/desktop/src-tauri/tauri.conf.json',
  'apps/desktop/src-tauri/Cargo.toml',
  'apps/mobile/capacitor.config.ts',
  'apps/mobile/src/native-mobile.ts',
  'apps/mobile/ios/.gitkeep',
  'apps/mobile/android/gradlew.bat',
  'apps/mobile/android/app/src/main/AndroidManifest.xml',
  'packages/shared/src/types/chat.ts',
  'packages/shared/src/types/agent.ts',
  'packages/shared/src/types/provider.ts',
  'packages/shared/src/types/security.ts',
  'packages/shared/src/types/prompt-template.ts',
  'packages/shared/src/types/usage.ts',
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
  'packages/core/src/provider/connection-diagnostics.ts',
  'packages/core/src/files/file-input.ts',
  'packages/core/src/usage/usage-ledger.ts',
  'packages/core/src/usage/cost-estimation.ts',
  'packages/core/src/security/security-policy.ts',
  'packages/core/src/model/model-capability.ts',
  'packages/core/src/model/model-comparison.ts',
  'packages/core/src/model/model-routing.ts',
  'packages/core/src/knowledge/knowledge-base.ts',
  'packages/core/src/agent/agent-preset.ts',
  'packages/core/src/prompt/prompt-template.ts',
  'packages/shared/src/types/file.ts',
  'packages/shared/src/types/knowledge.ts',
  'tests/file-input.test.ts',
  'tests/usage-ledger.test.ts',
  'tests/cost-estimation.test.ts',
  'tests/security-policy.test.ts',
  'tests/web-state.test.mjs',
  'tests/web-provider-runtime.test.mjs',
  'tests/model-capability.test.ts',
  'tests/model-comparison.test.ts',
  'tests/web-model-comparison.test.mjs',
  'tests/model-routing.test.ts',
  'tests/web-model-routing.test.mjs',
  'tests/web-cost-dashboard.test.mjs',
  'tests/native-desktop.test.mjs',
  'tests/native-media.test.mjs',
  'tests/native-voice.test.mjs',
  'tests/knowledge-base.test.ts',
  'tests/connection-diagnostics.test.ts',
  'tests/web-provider-diagnostics.test.mjs',
  'tests/agent-presets.test.ts',
  'tests/prompt-templates.test.ts',
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
  'docs/FILE_INPUT.md',
  'docs/THREE_TERMINAL_SHELLS.md',
  'docs/USAGE_ANALYTICS.md',
  'docs/TOOL_SECURITY.md',
  'docs/WEB_MVP.md',
  'docs/WEB_PROVIDER_RUNTIME.md',
  'docs/MODEL_CAPABILITIES.md',
  'docs/MODEL_COMPARISON.md',
  'docs/KNOWLEDGE_BASE.md',
  'docs/CONNECTION_DIAGNOSTICS.md',
  'docs/AGENT_PRESETS.md',
  'docs/PROMPT_TEMPLATES.md',
  'docs/MODEL_ROUTING.md',
  'docs/COST_ESTIMATION.md',
  'docs/NATIVE_INPUTS.md',
  'scripts/review-check.mjs',
  '.hello-world-harness/feature_list.json',
  '.hello-world-harness/sprint_plan.json',
];

const missing = requiredPaths.filter((path) => !existsSync(join(root, path)));

if (missing.length > 0) {
  console.error('Missing required scaffold paths:');
  for (const path of missing) {
    console.error(`- ${path}`);
  }
  process.exit(1);
}

const providerDoc = readFileSync(join(root, 'docs/PROVIDER_ADAPTERS.md'), 'utf8');
for (const expected of ['OpenAI-compatible', 'Ollama', 'apiKeyRef']) {
  if (!providerDoc.includes(expected)) {
    console.error(`Provider documentation is missing expected text: ${expected}`);
    process.exit(1);
  }
}

console.log(`hello-world scaffold check passed (${requiredPaths.length} paths).`);
