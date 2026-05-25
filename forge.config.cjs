const fs = require('node:fs')
const path = require('node:path')

function writeCommonJsMarker(directory) {
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, 'package.json'), '{"type":"commonjs"}\n')
}

module.exports = {
  packagerConfig: {
    name: 'JAMARQ Atlas',
    executableName: 'JAMARQ Atlas',
    asar: true,
  },
  hooks: {
    packageAfterCopy: async (_forgeConfig, buildPath) => {
      writeCommonJsMarker(path.join(buildPath, '.vite', 'build'))
    },
    postPackage: async () => {
      writeCommonJsMarker(path.join(__dirname, '.vite', 'build'))
    },
  },
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-vite',
      config: {
        build: [
          {
            entry: 'desktop/main.ts',
            config: 'vite.main.config.ts',
          },
          {
            entry: 'desktop/preload.ts',
            config: 'vite.preload.config.ts',
          },
        ],
        renderer: [
          {
            name: 'main_window',
            config: 'vite.renderer.config.ts',
          },
        ],
      },
    },
  ],
}
