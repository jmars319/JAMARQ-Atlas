import { app, BrowserWindow, ipcMain, safeStorage, session, shell } from 'electron'
import path from 'node:path'
import { startAtlasApiServer, type AtlasApiServer } from '../server/apiServer'
import { setGithubDesktopAuthStore } from '../server/githubAuth'
import type { AtlasDesktopRuntimeInfo } from '../src/domain/desktopRuntime'
import { loadDesktopEnv } from './config'
import { createGithubSafeStorageAuthStore } from './githubSecureAuth'
import { DesktopSqliteStore } from './storage'

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined
declare const MAIN_WINDOW_VITE_NAME: string

let mainWindow: BrowserWindow | null = null
let apiServer: AtlasApiServer | null = null
let sqliteStore: DesktopSqliteStore | null = null
let runtimeInfo: AtlasDesktopRuntimeInfo | null = null

const DEFAULT_DESKTOP_PORT = 52173

function requestedDesktopPort() {
  const configured = Number(process.env.ATLAS_DESKTOP_API_PORT)

  return Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_DESKTOP_PORT
}

function rendererStaticDir() {
  return path.join(__dirname, '..', 'renderer', MAIN_WINDOW_VITE_NAME)
}

function isAllowedAppNavigation(url: string) {
  return (
    Boolean(apiServer && url.startsWith(apiServer.url)) ||
    Boolean(MAIN_WINDOW_VITE_DEV_SERVER_URL && url.startsWith(MAIN_WINDOW_VITE_DEV_SERVER_URL))
  )
}

function registerIpcHandlers() {
  ipcMain.on('atlas:runtime-info', (event) => {
    event.returnValue = runtimeInfo
  })

  ipcMain.on('atlas:store-get', (event, key: string) => {
    try {
      event.returnValue = sqliteStore?.getStore(key) ?? null
    } catch {
      event.returnValue = null
    }
  })

  ipcMain.on('atlas:store-set', (event, key: string, value: string) => {
    try {
      sqliteStore?.setStore(key, value)
      event.returnValue = { ok: true }
    } catch (error) {
      event.returnValue = {
        ok: false,
        message: error instanceof Error ? error.message : 'Atlas SQLite write failed.',
      }
    }
  })

  ipcMain.on('atlas:store-remove', (event, key: string) => {
    try {
      sqliteStore?.removeStore(key)
      event.returnValue = { ok: true }
    } catch (error) {
      event.returnValue = {
        ok: false,
        message: error instanceof Error ? error.message : 'Atlas SQLite remove failed.',
      }
    }
  })

  ipcMain.handle('atlas:github-login', async () => {
    if (!apiServer) {
      return { ok: false, message: 'Atlas API server is not running.' }
    }

    await shell.openExternal(`${apiServer.url}/api/github/auth/login?returnTo=/desktop-auth-complete.html`)
    return {
      ok: true,
      message: 'GitHub sign-in opened in the system browser.',
    }
  })
}

function configureWindowSecurity() {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (!isAllowedAppNavigation(details.url)) {
      callback({})
      return
    }

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          [
            "default-src 'self'",
            "img-src 'self' data:",
            "font-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            "script-src 'self'",
            "connect-src 'self' https://api.github.com https://api.vercel.com https://*.supabase.co https://api.openai.com",
          ].join('; '),
        ],
      },
    })
  })
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 980,
    minWidth: 1120,
    minHeight: 720,
    title: 'JAMARQ Atlas',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedAppNavigation(url)) {
      return { action: 'allow' }
    }

    void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAllowedAppNavigation(url)) {
      return
    }

    event.preventDefault()
    void shell.openExternal(url)
  })

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
  } else if (apiServer) {
    await mainWindow.loadURL(apiServer.url)
  }
}

async function bootstrap() {
  if (process.env.ATLAS_DESKTOP_USER_DATA_DIR) {
    app.setPath('userData', process.env.ATLAS_DESKTOP_USER_DATA_DIR)
  }

  await app.whenReady()

  const userDataPath = app.getPath('userData')
  const envResult = loadDesktopEnv({
    appPath: app.getAppPath(),
    userDataPath,
  })
  sqliteStore = new DesktopSqliteStore({
    databasePath: path.join(userDataPath, 'atlas.sqlite'),
  })
  setGithubDesktopAuthStore(createGithubSafeStorageAuthStore(sqliteStore))

  const serverOptions = {
    host: '127.0.0.1',
    port: requestedDesktopPort(),
    staticDir: MAIN_WINDOW_VITE_DEV_SERVER_URL ? undefined : rendererStaticDir(),
  }

  try {
    apiServer = await startAtlasApiServer(serverOptions)
  } catch (error) {
    if ((error as { code?: string }).code !== 'EADDRINUSE') {
      throw error
    }

    apiServer = await startAtlasApiServer({ ...serverOptions, port: 0 })
  }
  process.env.GITHUB_APP_CALLBACK_URL ||= `${apiServer.url}/api/github/auth/callback`
  runtimeInfo = {
    platform: 'electron',
    apiBaseUrl: apiServer.url,
    storageBackend: 'sqlite',
    sqlitePath: sqliteStore.databasePath,
    configPath: envResult.configPath,
    secureStorageAvailable: safeStorage.isEncryptionAvailable(),
  }

  registerIpcHandlers()
  configureWindowSecurity()
  await createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow()
    }
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  sqliteStore?.close()
  sqliteStore = null
  void apiServer?.close()
  apiServer = null
})

void bootstrap()
