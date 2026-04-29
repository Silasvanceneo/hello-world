import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';

const maxFileLines = 800;
const roots = ['README.md', 'package.json', 'docs', 'apps', 'packages', 'scripts', 'tests'];
const ignoredDirectoryNames = new Set([
  '.git',
  '.omx',
  '.tmp-tests',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'target',
]);
const scannedExtensions = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.rs',
  '.toml',
  '.ts',
  '.tsx',
  '.webmanifest',
]);
const lineLimitedExtensions = new Set(['.css', '.html', '.js', '.mjs', '.rs', '.toml', '.ts', '.tsx']);
const secretPatterns = [
  {
    name: 'OpenAI-style secret',
    pattern: /sk-[A-Za-z0-9_-]{20,}/g,
  },
  {
    name: 'hardcoded credential literal',
    pattern: /(?:api[_-]?key|password|secret|token)\s*[:=]\s*['"`][^'"`\s]{12,}['"`]/gi,
  },
];

const failures = [];
const warnings = [];

for (const filePath of collectFiles(roots)) {
  const content = readFileSync(filePath, 'utf8');
  const normalizedPath = relative(process.cwd(), filePath).split(sep).join('/');
  const lineCount = countLines(content);
  if (lineLimitedExtensions.has(extname(filePath)) && lineCount > maxFileLines) {
    failures.push(`${normalizedPath}: ${lineCount} lines exceeds ${maxFileLines}`);
  }

  for (const { name, pattern } of secretPatterns) {
    pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern)) {
      const lineNumber = countLines(content.slice(0, match.index)) + 1;
      if (isAllowedDummyCredential(normalizedPath, content, match.index)) {
        continue;
      }
      failures.push(`${normalizedPath}:${lineNumber}: possible ${name}`);
    }
  }
}

const gitignore = existsSync('.gitignore') ? readFileSync('.gitignore', 'utf8') : '';
for (const expected of ['.env', '.env.*']) {
  if (!gitignore.split(/\r?\n/).includes(expected)) {
    failures.push(`.gitignore is missing ${expected}`);
  }
}

if (!existsSync('.hello-world-harness/progress.md')) {
  warnings.push('missing harness progress checkpoint file');
}

if (warnings.length > 0) {
  for (const warning of warnings) {
    console.warn(`Review warning: ${warning}`);
  }
}

if (failures.length > 0) {
  console.error('Review check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`review check passed (${roots.length} roots, max ${maxFileLines} lines/file, no suspicious secrets).`);

function collectFiles(paths) {
  const files = [];
  for (const currentPath of paths) {
    if (!existsSync(currentPath)) {
      continue;
    }
    const stats = statSync(currentPath);
    if (stats.isFile()) {
      files.push(currentPath);
      continue;
    }
    if (stats.isDirectory()) {
      walk(currentPath, files);
    }
  }
  return files.filter((filePath) => scannedExtensions.has(extname(filePath)));
}

function walk(currentPath, files) {
  const entries = readdirSync(currentPath, { withFileTypes: true });
  for (const entry of entries) {
    const nextPath = join(currentPath, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectoryNames.has(entry.name)) {
        walk(nextPath, files);
      }
      continue;
    }
    if (entry.isFile()) {
      files.push(nextPath);
    }
  }
}

function countLines(content) {
  return content.length === 0 ? 0 : content.split(/\r?\n/).length;
}

function isAllowedDummyCredential(path, content, matchIndex) {
  const isTest = path.startsWith('tests/') || path.includes('.test.');
  if (!isTest) {
    return false;
  }
  const lineStart = content.lastIndexOf('\n', matchIndex) + 1;
  const lineEndIndex = content.indexOf('\n', matchIndex);
  const lineEnd = lineEndIndex === -1 ? content.length : lineEndIndex;
  const line = content.slice(lineStart, lineEnd);
  return /['"`](runtime|dummy|test)-[A-Za-z0-9_-]+['"`]/.test(line);
}
