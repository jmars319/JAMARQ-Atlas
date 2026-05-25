import { contextBridge, ipcRenderer } from 'electron'
import type {
  AtlasDesktopBridge,
  AtlasDesktopRuntimeInfo,
} from '../src/domain/desktopRuntime'

const runtimeInfo = ipcRenderer.sendSync('atlas:runtime-info') as AtlasDesktopRuntimeInfo

contextBridge.exposeInMainWorld('atlasDesktop', {
  ...runtimeInfo,
  storage: {
    getItem: (key: string) => ipcRenderer.sendSync('atlas:store-get', key) as string | null,
    setItem: (key: string, value: string) => {
      const result = ipcRenderer.sendSync('atlas:store-set', key, value) as {
        ok: boolean
        message?: string
      }

      if (!result.ok) {
        throw new Error(result.message ?? 'Atlas SQLite write failed.')
      }
    },
    removeItem: (key: string) => {
      const result = ipcRenderer.sendSync('atlas:store-remove', key) as {
        ok: boolean
        message?: string
      }

      if (!result.ok) {
        throw new Error(result.message ?? 'Atlas SQLite remove failed.')
      }
    },
  },
  github: {
    login: () => ipcRenderer.invoke('atlas:github-login') as Promise<{ ok: boolean; message: string }>,
  },
} satisfies AtlasDesktopBridge)
