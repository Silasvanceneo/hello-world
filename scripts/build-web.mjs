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
await cp(join(webRoot, 'src', 'model-comparison.js'), join(buildDir, 'model-comparison.js'));
await cp(join(webRoot, 'src', 'native-desktop.js'), join(buildDir, 'native-desktop.js'));
await cp(join(webRoot, 'src', 'native-media.js'), join(buildDir, 'native-media.js'));
await cp(join(webRoot, 'src', 'provider-diagnostics.js'), join(buildDir, 'provider-diagnostics.js'));
await cp(join(webRoot, 'src', 'app.css'), join(buildDir, 'app.css'));

const html = await readFile(join(webRoot, 'index.html'), 'utf8');
await writeFile(join(buildDir, 'index.html'), html, 'utf8');
console.log(`Built Web app to ${buildDir}`);
