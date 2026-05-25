export interface AtlasDesktopRuntimeInfo {
  platform: 'electron'
  apiBaseUrl: string
  storageBackend: 'sqlite'
  sqlitePath: string
  configPath: string
  secureStorageAvailable: boolean
}

export interface AtlasDesktopBridge extends AtlasDesktopRuntimeInfo {
  storage: {
    getItem: (key: string) => string | null
    setItem: (key: string, value: string) => void
    removeItem: (key: string) => void
  }
  github: {
    login: () => Promise<{ ok: boolean; message: string }>
  }
}
