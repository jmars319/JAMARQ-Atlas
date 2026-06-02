import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const strict = process.argv.includes('--strict')
const configPath = path.join(root, 'scripts', 'maintainability.config.json')
const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {}
const configuredIgnores = Array.isArray(config.ignoredSegments) ? config.ignoredSegments : []
const ignoredPathIncludes = (config.ignoredPathIncludes ?? []).map((item) =>
  item.replaceAll('\\', '/'),
)
const ignoredSegments = new Set([
  'node_modules',
  '.git',
  '.next',
  '.nuxt',
  '.svelte-kit',
  'dist',
  'dist-bundle',
  'build',
  'out',
  'coverage',
  '.turbo',
  '.vite',
  'target',
  'gen',
  'release',
  '.desktop-runtime',
  '.wrangler',
  '.expo',
  'web-build',
  ...configuredIgnores,
])
const sourceExtensions = new Set(
  config.sourceExtensions ?? ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.rs', '.css', '.scss'],
)
const styleExtensions = new Set(['.css', '.scss', '.sass', '.less'])
const generatedPatterns = (config.generatedPatterns ?? [
  'dist/',
  'dist-bundle/',
  '/dist/',
  '/build/',
  '/out/',
  '/target/',
  '/gen/',
  '.desktop-runtime',
  'worker-configuration.d.ts',
  'vite-env.d.ts',
  'next-env.d.ts',
  '*.tsbuildinfo',
]).map((pattern) => pattern.replaceAll('\\', '/'))
const allowedGenerated = new Set(
  (config.allowedGenerated ?? []).map((item) => item.replaceAll('\\', '/')),
)
const specificFileBudgets = Object.fromEntries(
  Object.entries(config.specificFileBudgets ?? {}).map(([file, budget]) => [
    file.replaceAll('\\', '/'),
    Number(budget),
  ]),
)
const maxImpl = Number(config.maxImplementationFileLines ?? 900)
const maxStyle = Number(config.maxStyleFileLines ?? 400)
const maxAppShell = Number(config.maxAppShellLines ?? 425)
const maxDesktopMain = Number(config.maxDesktopMainLines ?? 450)
const maxDomainBarrel = Number(config.maxDomainBarrelLines ?? 450)
const nearLineMargin = Number(config.nearBudgetLineMargin ?? 25)

function shouldSkipDir(entryName) {
  return ignoredSegments.has(entryName)
}

function walk(directory, files = []) {
  if (!fs.existsSync(directory)) return files
  const relativeDirectory = path.relative(root, directory).replaceAll('\\', '/')
  if (
    ignoredPathIncludes.some(
      (item) => relativeDirectory === item || relativeDirectory.includes(item),
    )
  ) {
    return files
  }

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && shouldSkipDir(entry.name)) continue
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      walk(absolute, files)
      continue
    }
    if (sourceExtensions.has(path.extname(entry.name))) files.push(absolute)
  }
  return files
}

function lineCount(file) {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).length
}

function relative(file) {
  return path.relative(root, file).replaceAll('\\', '/')
}

function matchesPattern(file, pattern) {
  if (pattern.startsWith('*.')) return file.endsWith(pattern.slice(1))
  return file === pattern || file.includes(pattern)
}

function fileBudget(record) {
  if (specificFileBudgets[record.file]) return specificFileBudgets[record.file]
  const isAppShell = /(^|\/)App\.(tsx|jsx|ts|js)$/.test(record.file)
  const isDesktopMain =
    /(^|\/)(main|lib)\.(cjs|mjs|js|ts|rs)$/.test(record.file) &&
    /desktop|tauri|src-tauri/.test(record.file)
  const isDomainBarrel =
    /(^|\/)packages\/[^/]+\/src\/index\.ts$/.test(record.file) ||
    /(^|\/)packages\/shared-types\/src\/index\.ts$/.test(record.file)

  if (styleExtensions.has(record.ext)) return maxStyle
  if (isAppShell) return maxAppShell
  if (isDesktopMain) return maxDesktopMain
  if (isDomainBarrel) return maxDomainBarrel
  return maxImpl
}

function readTextIfExists(file) {
  const absolute = path.join(root, file)
  return fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : ''
}

function checkStartupImports() {
  const boundaries = config.startupImportBoundaries
  if (!boundaries) return []
  const banned = boundaries.bannedImportFragments ?? []
  const findings = []

  for (const file of boundaries.paths ?? []) {
    const text = readTextIfExists(file)
    if (!text) continue
    const imports = [...text.matchAll(/^\s*import\s+[^'"]*['"]([^'"]+)['"]/gm)].map(
      (match) => match[1],
    )

    for (const source of imports) {
      const normalized = source.replaceAll('\\', '/')
      const matched = banned.find((fragment) => normalized.includes(fragment))
      if (matched) findings.push(`${file} imports startup-banned module "${source}"`)
    }
  }

  return findings
}

function extractStringUnion(source, typeName) {
  const text = readTextIfExists(source)
  const match = text.match(
    new RegExp(`export\\s+type\\s+${typeName}\\s*=([\\s\\S]*?)(?:\\n\\s*export\\s+|\\n\\s*interface\\s+|\\n\\s*const\\s+|\\n\\s*$)`),
  )

  if (!match) return null
  return [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1])
}

function extractApiRoutes(sources) {
  const routes = new Set()

  for (const source of sources ?? []) {
    const text = readTextIfExists(source)
    if (!text) continue

    for (const match of text.matchAll(/['"]((?:\/api\/)[^'"]*)['"]/g)) {
      routes.add(match[1])
    }

    for (const route of extractApiRegexLiterals(text)) routes.add(`regex:${route}`)
  }

  return [...routes].sort()
}

function extractApiRegexLiterals(text) {
  const routes = []
  let index = 0

  while (index < text.length) {
    const start = text.indexOf('/^\\/api\\/', index)
    if (start === -1) break

    let escaped = false
    let inCharacterClass = false
    let end = start + 1

    for (; end < text.length; end += 1) {
      const char = text[end]

      if (escaped) {
        escaped = false
        continue
      }

      if (char === '\\') {
        escaped = true
        continue
      }

      if (char === '[') {
        inCharacterClass = true
        continue
      }

      if (char === ']') {
        inCharacterClass = false
        continue
      }

      if (char === '/' && !inCharacterClass) {
        end += 1
        while (/[a-z]/i.test(text[end] ?? '')) end += 1
        routes.push(text.slice(start, end))
        break
      }
    }

    index = Math.max(end, start + 1)
  }

  return routes
}

function checkContractSnapshots() {
  const findings = []

  for (const contract of config.contractSnapshots ?? []) {
    let actual = null

    if (contract.type === 'string-union') {
      actual = extractStringUnion(contract.source, contract.typeName)
    } else if (contract.type === 'api-routes') {
      actual = extractApiRoutes(contract.sources)
    } else {
      continue
    }

    if (!actual) {
      findings.push(`${contract.label}: source contract was not found.`)
      continue
    }
    const snapshotPath = path.join(root, contract.snapshot)
    if (!fs.existsSync(snapshotPath)) {
      findings.push(`${contract.label}: snapshot ${contract.snapshot} is missing.`)
      continue
    }
    const expected = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'))
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      findings.push(`${contract.label}: public contract snapshot drifted.`)
    }
  }

  return findings
}

function checkAssetBudgets() {
  const findings = []

  for (const [file, budget] of Object.entries(config.assetBudgets ?? {})) {
    const absolute = path.join(root, file)
    if (!fs.existsSync(absolute)) {
      findings.push(`${file} asset is missing.`)
      continue
    }
    const size = fs.statSync(absolute).size
    if (size > Number(budget)) {
      findings.push(`${file} is ${size} bytes; asset budget is ${budget} bytes.`)
    }
  }

  return findings
}

const sourceRoots = (
  config.sourceRoots ?? ['src', 'app', 'apps', 'packages', 'crates', 'server', 'desktop', 'scripts']
).filter((dir) => fs.existsSync(path.join(root, dir)))
const files = sourceRoots
  .flatMap((directory) => walk(path.join(root, directory)))
  .filter((file, index, all) => all.indexOf(file) === index)
const records = files.map((file) => ({
  file: relative(file),
  ext: path.extname(file),
  lines: lineCount(file),
}))
const implementationRecords = records.filter((record) => !styleExtensions.has(record.ext))
const styleRecords = records.filter((record) => styleExtensions.has(record.ext))
const generatedRecords = records.filter(
  (record) =>
    generatedPatterns.some((pattern) => matchesPattern(record.file, pattern)) &&
    !allowedGenerated.has(record.file),
)

const violations = []
const nearBudget = []
for (const record of records) {
  const budget = fileBudget(record)
  if (record.lines > budget) {
    violations.push(`${record.file} has ${record.lines} lines; budget is ${budget}.`)
  } else if (budget - record.lines <= nearLineMargin) {
    nearBudget.push(`${record.file} has ${record.lines} lines; budget is ${budget}.`)
  }
}

if (generatedRecords.length > 0 && config.allowGeneratedArtifacts !== true) {
  violations.push(
    `generated/runtime artifacts in source scan: ${generatedRecords
      .slice(0, 12)
      .map((record) => record.file)
      .join(', ')}${generatedRecords.length > 12 ? ` and ${generatedRecords.length - 12} more` : ''}`,
  )
}
violations.push(...checkStartupImports())
violations.push(...checkContractSnapshots())
violations.push(...checkAssetBudgets())

console.log(`${config.label ?? path.basename(root)} maintainability audit`)
console.log('')
console.log('Largest implementation files:')
for (const record of implementationRecords.sort((a, b) => b.lines - a.lines).slice(0, 12)) {
  console.log(`- ${record.file}: ${record.lines} lines`)
}
console.log('')
console.log('Largest style files:')
for (const record of styleRecords.sort((a, b) => b.lines - a.lines).slice(0, 8)) {
  console.log(`- ${record.file}: ${record.lines} lines`)
}
console.log('')
console.log(`Generated/runtime findings: ${generatedRecords.length}`)
console.log(`Near-budget warnings: ${nearBudget.length}`)

if (violations.length > 0 || nearBudget.length > 0) {
  console.log('')
  if (violations.length > 0) {
    console.log('Maintainability budget violations:')
    for (const violation of violations) console.log(`- ${violation}`)
  }
  if (nearBudget.length > 0) {
    console.log('Near-budget warnings:')
    for (const warning of nearBudget) console.log(`- ${warning}`)
  }
  if (strict) process.exit(1)
}
