export const DEFAULT_DESKTOP_PORT = 52173

export function parseLoopbackCallbackPort(callbackUrl: string | undefined) {
  if (!callbackUrl) {
    return null
  }

  try {
    const parsed = new URL(callbackUrl)
    const isLoopback = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost'
    const isGithubCallback = parsed.pathname === '/api/github/auth/callback'
    const configuredPort = Number(parsed.port)

    if (!isLoopback || !isGithubCallback || !Number.isFinite(configuredPort)) {
      return null
    }

    return configuredPort
  } catch {
    return null
  }
}

export function requestedDesktopPort(env: NodeJS.ProcessEnv = process.env) {
  const explicitPort = env.ATLAS_DESKTOP_API_PORT?.trim()
  const configured = explicitPort ? Number(explicitPort) : NaN

  if (Number.isFinite(configured) && configured >= 0) {
    return configured
  }

  return parseLoopbackCallbackPort(env.GITHUB_APP_CALLBACK_URL) ?? DEFAULT_DESKTOP_PORT
}
