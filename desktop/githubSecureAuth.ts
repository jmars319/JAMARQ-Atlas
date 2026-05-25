import { safeStorage } from 'electron'
import type { GithubDesktopAuthStore, GithubTokenState } from '../server/githubAuth'
import type { DesktopSqliteStore } from './storage'

const GITHUB_TOKEN_KEY = 'github.oauth.token'

export function createGithubSafeStorageAuthStore(
  store: DesktopSqliteStore,
): GithubDesktopAuthStore {
  return {
    async getTokenState() {
      if (!safeStorage.isEncryptionAvailable()) {
        return null
      }

      const encrypted = store.getSecureItem(GITHUB_TOKEN_KEY)

      if (!encrypted) {
        return null
      }

      try {
        const decrypted = safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
        return JSON.parse(decrypted) as GithubTokenState
      } catch {
        store.removeSecureItem(GITHUB_TOKEN_KEY)
        return null
      }
    },
    async setTokenState(token) {
      if (!safeStorage.isEncryptionAvailable()) {
        return
      }

      const encrypted = safeStorage.encryptString(JSON.stringify(token))
      store.setSecureItem(GITHUB_TOKEN_KEY, encrypted.toString('base64'))
    },
    async clearTokenState() {
      store.removeSecureItem(GITHUB_TOKEN_KEY)
    },
  }
}
