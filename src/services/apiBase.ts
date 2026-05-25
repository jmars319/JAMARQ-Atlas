import type { AtlasDesktopBridge } from '../domain/desktopRuntime'

type DesktopGlobal = typeof globalThis & {
  window?: {
    atlasDesktop?: Pick<AtlasDesktopBridge, 'apiBaseUrl'>
  }
}

function hasProtocol(value: string) {
  return /^[a-z][a-z\d+.-]*:/i.test(value)
}

export function atlasApiUrl(path: string) {
  if (hasProtocol(path)) {
    return path
  }

  const desktopBase = (globalThis as DesktopGlobal).window?.atlasDesktop?.apiBaseUrl ?? ''

  if (!desktopBase) {
    return path
  }

  return new URL(path, desktopBase.endsWith('/') ? desktopBase : `${desktopBase}/`).toString()
}
