export {}

import type {
  AtlasDesktopBridge as RuntimeAtlasDesktopBridge,
  AtlasDesktopRuntimeInfo as RuntimeAtlasDesktopRuntimeInfo,
} from './domain/desktopRuntime'

declare global {
  type AtlasDesktopRuntimeInfo = RuntimeAtlasDesktopRuntimeInfo
  type AtlasDesktopBridge = RuntimeAtlasDesktopBridge

  interface Window {
    atlasDesktop?: AtlasDesktopBridge
  }
}
