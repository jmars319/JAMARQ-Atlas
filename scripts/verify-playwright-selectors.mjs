import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const marker = 'selector-intentional-first';
const scanRoots = ['tests', 'src'];
const ignoredDirs = new Set([
  'node_modules',
  'dist',
  'build',
  '.vite',
  'out',
  'coverage',
  'playwright-report',
  'test-results',
  'blob-report'
]);
const sourcePattern = /\.(?:cjs|mjs|js|jsx|ts|tsx)$/;

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

const violations = [];

for (const scanRoot of scanRoots) {
  for (const file of walk(path.join(rootDir, scanRoot))) {
    const relPath = path.relative(rootDir, file);
    if (relPath === 'scripts/verify-playwright-selectors.mjs') {
      continue;
    }
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!line.includes('.first(')) {
        return;
      }
      const localContext = [lines[index - 2], lines[index - 1], line].filter(Boolean).join('\n');
      if (!localContext.includes(marker)) {
        violations.push(`${relPath}:${index + 1}: .first() needs a stable selector or ${marker} reason`);
      }
    });
  }
}

if (violations.length) {
  console.error('[selector-audit] Broad Playwright selectors found:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log('[selector-audit] Playwright selector audit passed.');
