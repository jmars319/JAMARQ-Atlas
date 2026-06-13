import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const ignoredDirs = new Set([
  '.git',
  '.next',
  'blob-report',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results'
]);
const sourcePattern = /\.(?:cjs|mjs|js|jsx|ts|tsx)$/;
const testIdPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const testIdMarker = 'testid-intentional-name';
const productionUrlMarker = 'production-url-intentional';
const artifactDirs = ['playwright-report', 'test-results', 'blob-report'];
const remoteUrlPattern = /https?:\/\/(?!(?:localhost|127[.]0[.]0[.]1|0[.]0[.]0[.]0|\[::1\])(?::|\/|$))/;

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) {
    return files;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else if (sourcePattern.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function existingFiles(paths) {
  return paths.filter((candidate) => fs.existsSync(path.join(rootDir, candidate)));
}

function hasContextMarker(lines, index, marker) {
  return [lines[index - 2], lines[index - 1], lines[index]]
    .filter(Boolean)
    .join('\n')
    .includes(marker);
}

function collectMatches(line, patterns) {
  const matches = [];
  for (const pattern of patterns) {
    for (const match of line.matchAll(pattern)) {
      matches.push(match[1]);
    }
  }
  return matches;
}

const violations = [];
const scanFiles = [
  ...existingFiles(['e2e', 'tests', 'frontend', 'src']).flatMap((scanRoot) => walk(path.join(rootDir, scanRoot))),
  ...existingFiles(['playwright.config.js', 'playwright.config.cjs', 'playwright.config.ts']).map((file) => path.join(rootDir, file))
];

for (const file of scanFiles) {
  const relPath = path.relative(rootDir, file);
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    const testIds = collectMatches(line, [
      /data-testid\s*=\s*["']([^"']+)["']/g,
      /data-testid\s*=\s*\{\s*["']([^"']+)["']\s*\}/g,
      /getByTestId\(\s*["'`]([^"'`$]+)["'`]\s*\)/g
    ]);
    for (const testId of testIds) {
      if (/[${}]/.test(testId)) {
        continue;
      }
      if (!testIdPattern.test(testId) && !hasContextMarker(lines, index, testIdMarker)) {
        violations.push(`${relPath}:${index + 1}: test id "${testId}" should use lowercase kebab-case`);
      }
    }

    const isBrowserNavigation = /(?:page|request)\.(?:goto|get|post|put|patch|delete)\(\s*["'`]https?:\/\//.test(line) && remoteUrlPattern.test(line);
    const isRemoteBaseUrl = /\b(?:baseURL|url)\s*:\s*["'`]https?:\/\//.test(line) && relPath.startsWith('playwright.config') && remoteUrlPattern.test(line);
    if ((isBrowserNavigation || isRemoteBaseUrl) && !hasContextMarker(lines, index, productionUrlMarker)) {
      violations.push(`${relPath}:${index + 1}: browser tests should not target production URLs`);
    }
  });
}

const manifestCandidates = [
  'e2e/smoke-routes.json',
  'tests/smoke-routes.json',
  'scripts/contracts/smoke-routes.json'
];
const manifestPath = manifestCandidates.find((candidate) => fs.existsSync(path.join(rootDir, candidate)));
if (!manifestPath) {
  violations.push('Missing smoke route manifest. Add e2e/smoke-routes.json or tests/smoke-routes.json.');
} else {
  const parsed = JSON.parse(fs.readFileSync(path.join(rootDir, manifestPath), 'utf8'));
  const routes = Array.isArray(parsed.routes) ? parsed.routes : [];
  const seenNames = new Set();
  const seenPaths = new Set();
  if (!routes.length) {
    violations.push(`${manifestPath}: routes must contain at least one route`);
  }
  routes.forEach((route, index) => {
    const label = `${manifestPath}:routes[${index}]`;
    if (!route.name || !/^[a-z][a-z0-9-]*$/.test(route.name)) {
      violations.push(`${label}: name should use lowercase kebab-case`);
    }
    if (!route.path || typeof route.path !== 'string' || !route.path.startsWith('/') || /^https?:\/\//.test(route.path)) {
      violations.push(`${label}: path should be a local route beginning with /`);
    }
    if (seenNames.has(route.name)) {
      violations.push(`${label}: duplicate route name "${route.name}"`);
    }
    if (seenPaths.has(route.path)) {
      violations.push(`${label}: duplicate route path "${route.path}"`);
    }
    seenNames.add(route.name);
    seenPaths.add(route.path);
  });
}

const gitignore = fs.existsSync(path.join(rootDir, '.gitignore'))
  ? fs.readFileSync(path.join(rootDir, '.gitignore'), 'utf8')
  : '';
for (const artifactDir of artifactDirs) {
  if (!new RegExp(`(^|/)${artifactDir}/?`, 'm').test(gitignore)) {
    violations.push(`.gitignore should ignore ${artifactDir}/`);
  }
}

if (violations.length) {
  console.error('[test-guardrails] Guardrail violations found:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log('[test-guardrails] Test guardrails passed.');
