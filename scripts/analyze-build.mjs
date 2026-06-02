import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const root = process.cwd()
const strict = process.argv.includes('--strict')
const configPath = path.join(root, 'scripts', 'maintainability.config.json')
const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {}
const budgetBytes = Number(process.env.BUNDLE_BUDGET_KB ?? config.initialBundleBudgetKb ?? 450) * 1024
const nearBudgetBytes = Number(config.nearBundleBudgetKb ?? 4) * 1024
const candidateAssetDirs = config.assetDirs ?? [
  'dist/assets',
  'build/assets',
  'out/assets',
  'apps/webapp/dist/assets',
  'apps/desktop/dist/assets',
  'apps/desktopapp/dist/assets',
  'desktop/shared/src/setup/ui/dist/assets',
]
const routeChunkBudgets = Object.fromEntries(
  Object.entries(config.routeChunkBudgetsKb ?? {}).map(([prefix, budget]) => [
    prefix,
    Number(budget) * 1024,
  ]),
)

function sizeRecord(base, file) {
  const absolute = path.join(base, file)
  const raw = fs.readFileSync(absolute)
  return {
    file: path.relative(root, absolute).replaceAll('\\', '/'),
    basename: file,
    rawBytes: raw.byteLength,
    gzipBytes: zlib.gzipSync(raw).byteLength,
  }
}

const assets = []
for (const dir of candidateAssetDirs) {
  const absolute = path.join(root, dir)
  if (!fs.existsSync(absolute)) continue
  for (const file of fs.readdirSync(absolute)) {
    if (file.endsWith('.js')) assets.push(sizeRecord(absolute, file))
  }
}

if (assets.length === 0) {
  const entryCandidates = config.entryFiles ?? [
    'src/index.ts',
    'src/index.js',
    'src/App.tsx',
    'apps/desktop/src/App.tsx',
    'apps/desktopapp/src/App.tsx',
  ]
  const entries = entryCandidates
    .filter((entry) => fs.existsSync(path.join(root, entry)))
    .map((entry) => ({
      entry,
      lines: fs.readFileSync(path.join(root, entry), 'utf8').split(/\r?\n/).length,
    }))
  console.log(`${config.label ?? path.basename(root)} build size report`)
  console.log('No built JavaScript assets found. Run the app build first for bundle sizes.')
  for (const entry of entries) console.log(`- ${entry.entry}: ${entry.lines} source lines`)
  if (strict && config.requireBuiltAssets === true) process.exit(1)
  process.exit(0)
}

function routeBudgetFor(asset) {
  const match = Object.entries(routeChunkBudgets).find(([prefix]) =>
    asset.basename.startsWith(prefix),
  )
  return match ? match[1] : null
}

const sorted = assets.sort((a, b) => b.rawBytes - a.rawBytes)
const initialPattern = config.initialChunkPattern
  ? new RegExp(config.initialChunkPattern)
  : /(^|\/)index-[\w-]+\.js$/
const initial = sorted.find((asset) => initialPattern.test(asset.file)) ?? sorted[0]
const violations = []
const nearBudget = []

if (initial.rawBytes > budgetBytes) {
  violations.push(
    `Initial/largest route chunk exceeds target by ${((initial.rawBytes - budgetBytes) / 1024).toFixed(2)} kB.`,
  )
} else if (budgetBytes - initial.rawBytes <= nearBudgetBytes) {
  nearBudget.push(
    `Initial/largest route chunk is within ${(nearBudgetBytes / 1024).toFixed(0)} kB of its target.`,
  )
}

for (const asset of sorted) {
  const budget = routeBudgetFor(asset)
  if (!budget) continue
  if (asset.rawBytes > budget) {
    violations.push(
      `${asset.basename} is ${(asset.rawBytes / 1024).toFixed(2)} kB raw; route budget is ${(budget / 1024).toFixed(0)} kB.`,
    )
  } else if (budget - asset.rawBytes <= nearBudgetBytes) {
    nearBudget.push(
      `${asset.basename} is within ${(nearBudgetBytes / 1024).toFixed(0)} kB of its route budget.`,
    )
  }
}

console.log(`${config.label ?? path.basename(root)} web bundle report`)
console.log(
  `Initial/largest route chunk: ${initial.file} ${(initial.rawBytes / 1024).toFixed(2)} kB raw / ${(initial.gzipBytes / 1024).toFixed(2)} kB gzip`,
)
console.log(`Target: ${(budgetBytes / 1024).toFixed(0)} kB raw`)
console.log('')
console.log('Largest JavaScript chunks:')
for (const asset of sorted.slice(0, 12)) {
  const budget = routeBudgetFor(asset)
  const budgetLabel = budget ? ` / budget ${(budget / 1024).toFixed(0)} kB` : ''
  console.log(
    `- ${asset.file}: ${(asset.rawBytes / 1024).toFixed(2)} kB raw / ${(asset.gzipBytes / 1024).toFixed(2)} kB gzip${budgetLabel}`,
  )
}
console.log('')
console.log(`Near-budget warnings: ${nearBudget.length}`)

if (violations.length > 0 || nearBudget.length > 0) {
  console.log('')
  if (violations.length > 0) {
    console.log('Bundle budget violations:')
    for (const violation of violations) console.log(`- ${violation}`)
  }
  if (nearBudget.length > 0) {
    console.log('Near-budget warnings:')
    for (const warning of nearBudget) console.log(`- ${warning}`)
  }
  if (strict) process.exit(1)
}
