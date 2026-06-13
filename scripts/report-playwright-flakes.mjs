import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const reportFiles = process.argv.slice(2);
if (!reportFiles.length) {
  reportFiles.push('test-results/playwright-results.json', 'test-results/playwright-desktop-results.json');
}

function collectTests(suite, tests = []) {
  for (const spec of suite.specs || []) {
    for (const test of spec.tests || []) {
      tests.push({
        title: [...(spec.titlePath || []), spec.title].filter(Boolean).join(' > '),
        outcome: test.outcome || test.status || 'unknown',
        attempts: (test.results || []).length
      });
    }
  }
  for (const child of suite.suites || []) {
    collectTests(child, tests);
  }
  return tests;
}

let found = false;
for (const reportFile of reportFiles) {
  const fullPath = path.join(rootDir, reportFile);
  if (!fs.existsSync(fullPath)) {
    continue;
  }
  found = true;
  const report = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  const tests = (report.suites || []).flatMap((suite) => collectTests(suite));
  const retried = tests.filter((test) => test.attempts > 1 || test.outcome === 'flaky');
  const failed = tests.filter((test) => ['failed', 'timedOut', 'interrupted', 'unexpected'].includes(test.outcome));
  console.log(`[playwright-summary] ${reportFile}: ${tests.length} tests, ${retried.length} retried/flaky, ${failed.length} failed.`);
  for (const test of retried.slice(0, 10)) {
    console.log(`- retried ${test.attempts}x: ${test.title}`);
  }
}

if (!found) {
  console.log('[playwright-summary] No Playwright JSON report found yet.');
}
