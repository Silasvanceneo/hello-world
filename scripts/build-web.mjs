import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const webRoot = join(root, 'apps', 'web');
const buildDir = join(webRoot, 'build');

await rm(buildDir, { recursive: true, force: true });
await mkdir(buildDir, { recursive: true });
await cp(join(webRoot, 'static'), buildDir, { recursive: true });
await cp(join(webRoot, 'src', 'runtime.js'), join(buildDir, 'runtime.js'));
await cp(join(webRoot, 'src', 'web-state.js'), join(buildDir, 'web-state.js'));
await cp(join(webRoot, 'src', 'provider-runtime.js'), join(buildDir, 'provider-runtime.js'));
await cp(join(webRoot, 'src', 'backup-dashboard.js'), join(buildDir, 'backup-dashboard.js'));
await cp(join(webRoot, 'src', 'branch-dashboard.js'), join(buildDir, 'branch-dashboard.js'));
await cp(join(webRoot, 'src', 'cost-dashboard.js'), join(buildDir, 'cost-dashboard.js'));
await cp(join(webRoot, 'src', 'sync-dashboard.js'), join(buildDir, 'sync-dashboard.js'));
await cp(join(webRoot, 'src', 'session-organizer.js'), join(buildDir, 'session-organizer.js'));
await cp(join(webRoot, 'src', 'message-list.js'), join(buildDir, 'message-list.js'));
await cp(join(webRoot, 'src', 'multi-window-sync.js'), join(buildDir, 'multi-window-sync.js'));
await cp(join(webRoot, 'src', 'model-comparison.js'), join(buildDir, 'model-comparison.js'));
await cp(join(webRoot, 'src', 'model-routing.js'), join(buildDir, 'model-routing.js'));
await cp(join(webRoot, 'src', 'native-desktop.js'), join(buildDir, 'native-desktop.js'));
await cp(join(webRoot, 'src', 'native-media.js'), join(buildDir, 'native-media.js'));
await cp(join(webRoot, 'src', 'native-voice.js'), join(buildDir, 'native-voice.js'));
await cp(join(webRoot, 'src', 'provider-diagnostics.js'), join(buildDir, 'provider-diagnostics.js'));
await cp(join(webRoot, 'src', 'app.css'), join(buildDir, 'app.css'));

const html = await readFile(join(webRoot, 'index.html'), 'utf8');
await writeFile(join(buildDir, 'index.html'), html, 'utf8');
console.log(`Built Web app to ${buildDir}`);
