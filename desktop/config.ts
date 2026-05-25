import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

export type EnvRecord = Record<string, string | undefined>

export interface DesktopEnvLoadResult {
  configPath: string
  repoEnvPath: string
  loadedRepoKeys: string[]
  loadedConfigKeys: string[]
}

function parseEnvLine(line: string) {
  const trimmed = line.trim()

  if (!trimmed || trimmed.startsWith('#')) {
    return null
  }

  const separator = trimmed.indexOf('=')

  if (separator < 1) {
    return null
  }

  const key = trimmed.slice(0, separator).trim()
  let value = trimmed.slice(separator + 1).trim()

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  }

  return key ? { key, value } : null
}

export function parseDesktopEnvFile(content: string) {
  return content
    .split(/\r?\n/)
    .map(parseEnvLine)
    .filter((entry): entry is { key: string; value: string } => Boolean(entry))
}

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) {
    return []
  }

  return parseDesktopEnvFile(readFileSync(filePath, 'utf8'))
}

function applyEnvEntries({
  entries,
  env,
  shellKeys,
  overrideNonShell,
}: {
  entries: Array<{ key: string; value: string }>
  env: EnvRecord
  shellKeys: Set<string>
  overrideNonShell: boolean
}) {
  const loaded: string[] = []

  for (const { key, value } of entries) {
    if (shellKeys.has(key)) {
      continue
    }

    if (!overrideNonShell && env[key] !== undefined) {
      continue
    }

    env[key] = value
    loaded.push(key)
  }

  return loaded
}

export function loadDesktopEnv({
  appPath,
  userDataPath,
  env = process.env,
}: {
  appPath: string
  userDataPath: string
  env?: EnvRecord
}): DesktopEnvLoadResult {
  const shellKeys = new Set(
    Object.entries(env)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key),
  )
  const repoEnvPath = path.join(appPath, '.env')
  const configPath = path.join(userDataPath, 'atlas.env')
  const loadedRepoKeys = applyEnvEntries({
    entries: loadEnvFile(repoEnvPath),
    env,
    shellKeys,
    overrideNonShell: false,
  })
  const loadedConfigKeys = applyEnvEntries({
    entries: loadEnvFile(configPath),
    env,
    shellKeys,
    overrideNonShell: true,
  })

  return {
    configPath,
    repoEnvPath,
    loadedRepoKeys,
    loadedConfigKeys,
  }
}
