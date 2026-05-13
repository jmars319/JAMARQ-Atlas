import type {
  DeploymentArtifact,
  DeploymentTarget,
  DeploymentVerificationCheck,
  HealthCheckResult,
} from '../domain/dispatch'
import { probeHealthChecks } from './dispatchHealthChecks'

export interface ArtifactInspectionResult {
  artifactId: string
  filename: string
  checksum: string
  inspectedAt: string
  topLevelEntries: string[]
  warnings: string[]
}

export interface DeploymentVerificationEvidence {
  check: DeploymentVerificationCheck
  url: string
  result: HealthCheckResult
  passedExpectation: boolean
  message: string
}

const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function byteArrayToHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function checksumFile(buffer: ArrayBuffer) {
  if (!globalThis.crypto?.subtle) {
    return ''
  }

  const hash = await globalThis.crypto.subtle.digest('SHA-256', buffer)
  return `sha256-${byteArrayToHex(hash)}`
}

function readZipEntries(buffer: ArrayBuffer) {
  const view = new DataView(buffer)
  const decoder = new TextDecoder()
  const entries: string[] = []
  let offset = 0

  while (offset + 46 < view.byteLength) {
    if (view.getUint32(offset, true) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE) {
      offset += 1
      continue
    }

    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const nameStart = offset + 46
    const nameEnd = nameStart + nameLength

    if (nameEnd > view.byteLength) {
      break
    }

    entries.push(decoder.decode(new Uint8Array(buffer, nameStart, nameLength)))
    offset = nameEnd + extraLength + commentLength
  }

  return entries
}

function topLevelEntries(entries: string[]) {
  return unique(
    entries.map((entry) => {
      const clean = entry.replace(/\\/g, '/').replace(/^\.\/+/, '')
      const [first, second] = clean.split('/')

      return second ? `${first}/` : first
    }),
  ).sort()
}

function artifactIndicatorWarning(artifact: DeploymentArtifact, entries: string[]) {
  const joined = entries.join('\n').toLowerCase()

  if (artifact.role === 'placeholder' && !joined.includes('index.html')) {
    return 'Placeholder artifact does not expose an index.html entry.'
  }

  if (
    artifact.role === 'frontend' &&
    !/(^|\/)(index\.html|assets\/|dist\/|build\/)/i.test(joined)
  ) {
    return 'Frontend artifact does not show common frontend build entries.'
  }

  if (
    artifact.role === 'backend' &&
    !/(^|\/)(composer\.json|vendor\/|index\.php|routes\/|migrations\/)/i.test(joined)
  ) {
    return 'Backend artifact does not show common PHP/backend entries.'
  }

  return ''
}

export async function inspectDeploymentArtifact(
  file: File,
  artifact: DeploymentArtifact,
): Promise<ArtifactInspectionResult> {
  const buffer = await file.arrayBuffer()
  const inspectedAt = new Date().toISOString()
  const checksum = await checksumFile(buffer)
  const entries = readZipEntries(buffer)
  const warnings = [
    ...(file.name !== artifact.filename
      ? [`Expected ${artifact.filename}, but selected ${file.name}.`]
      : []),
    ...(entries.length === 0 ? ['No ZIP central-directory entries could be inspected.'] : []),
    ...entries
      .filter((entry) => entry.startsWith('/') || entry.includes('../') || entry.includes('..\\'))
      .map((entry) => `Dangerous ZIP path detected: ${entry}`),
    artifactIndicatorWarning(artifact, entries),
  ].filter(Boolean)

  return {
    artifactId: artifact.id,
    filename: file.name,
    checksum,
    inspectedAt,
    topLevelEntries: topLevelEntries(entries),
    warnings,
  }
}

function buildCheckUrl(target: DeploymentTarget, check: DeploymentVerificationCheck) {
  if (!target.publicUrl) {
    return ''
  }

  return new URL(check.urlPath, target.publicUrl.endsWith('/') ? target.publicUrl : `${target.publicUrl}/`).toString()
}

export async function runDeploymentVerificationChecks({
  target,
  checks,
}: {
  target: DeploymentTarget
  checks: DeploymentVerificationCheck[]
}): Promise<DeploymentVerificationEvidence[]> {
  const urls = checks.map((check) => buildCheckUrl(target, check))
  const healthResults = await probeHealthChecks(urls)

  return checks.map((check, index) => {
    const result = healthResults[index]
    const passedExpectation =
      typeof result.statusCode === 'number' && check.expectedStatuses.includes(result.statusCode)

    return {
      check,
      url: urls[index],
      result,
      passedExpectation,
      message: passedExpectation
        ? `Expected status observed: ${result.statusCode}.`
        : `Expected ${check.expectedStatuses.join('/')} but observed ${
            result.statusCode ?? 'no status'
          }.`,
    }
  })
}
