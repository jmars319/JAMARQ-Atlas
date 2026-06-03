const fs = require('node:fs')
const path = require('node:path')

function writeCommonJsMarker(directory) {
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, 'package.json'), '{"type":"commonjs"}\n')
}

function directNodeModuleRoot(packageName) {
  return path.join(__dirname, 'node_modules', ...packageName.split('/'))
}

function resolveNodeModuleRoot(packageName) {
  try {
    return path.dirname(require.resolve(`${packageName}/package.json`))
  } catch {
    // Some packages hide package.json behind exports. Fall through to the
    // module entrypoint or direct node_modules path.
  }

  try {
    const resolved = require.resolve(packageName)

    if (path.isAbsolute(resolved)) {
      let packageRoot = path.dirname(resolved)

      while (!fs.existsSync(path.join(packageRoot, 'package.json'))) {
        const parent = path.dirname(packageRoot)

        if (parent === packageRoot) {
          break
        }

        packageRoot = parent
      }

      if (fs.existsSync(path.join(packageRoot, 'package.json'))) {
        return packageRoot
      }
    }
  } catch {
    // Fall through to direct node_modules lookup.
  }

  const packageRoot = directNodeModuleRoot(packageName)

  if (fs.existsSync(path.join(packageRoot, 'package.json'))) {
    return packageRoot
  }

  throw new Error(`Unable to locate package root for ${packageName}`)
}

const PACKAGED_NODE_MODULES = [
  '@supabase/auth-js',
  '@supabase/functions-js',
  '@supabase/phoenix',
  '@supabase/postgrest-js',
  '@supabase/realtime-js',
  '@supabase/storage-js',
  '@supabase/supabase-js',
  'ssh2-sftp-client',
  'ssh2',
  'asn1',
  'bcrypt-pbkdf',
  'buffer-from',
  'buildcheck',
  'concat-stream',
  'cpu-features',
  'inherits',
  'nan',
  'readable-stream',
  'safe-buffer',
  'safer-buffer',
  'string_decoder',
  'iceberg-js',
  'openai',
  'tweetnacl',
  'tslib',
  'typedarray',
  'util-deprecate',
]

function copyNodeModulePackage(buildPath, packageName) {
  const packageRoot = resolveNodeModuleRoot(packageName)
  const nodeModulesRoot = path.join(__dirname, 'node_modules')

  if (!packageRoot.startsWith(`${nodeModulesRoot}${path.sep}`)) {
    throw new Error(`Refusing to package ${packageName} from ${packageRoot}`)
  }

  const destination = path.join(buildPath, 'node_modules', packageName)

  fs.rmSync(destination, { recursive: true, force: true })
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.cpSync(packageRoot, destination, {
    recursive: true,
    filter(source) {
      return !source.includes(`${path.sep}.git${path.sep}`)
    },
  })
}

function copyPackagedNodeModules(buildPath) {
  for (const packageName of PACKAGED_NODE_MODULES) {
    copyNodeModulePackage(buildPath, packageName)
  }
}

module.exports = {
  packagerConfig: {
    name: 'Atlas by Tenra',
    executableName: 'Atlas by Tenra',
    appBundleId: 'com.electron.jamarq-atlas',
    asar: false,
    osxSign: {
      identity: '-',
      identityValidation: false,
      hardenedRuntime: false,
      preAutoEntitlements: false,
      preEmbedProvisioningProfile: false,
      timestamp: 'none',
      optionsForFile: () => ({
        hardenedRuntime: false,
        timestamp: 'none',
      }),
    },
  },
  hooks: {
    readPackageJson: async (_forgeConfig, packageJson) => ({
      ...packageJson,
      type: 'commonjs',
    }),
    packageAfterCopy: async (_forgeConfig, buildPath) => {
      writeCommonJsMarker(path.join(buildPath, '.vite', 'build'))
      copyPackagedNodeModules(buildPath)
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
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
    },
    {
      name: '@electron-forge/maker-deb',
      platforms: ['linux'],
    },
    {
      name: '@electron-forge/maker-rpm',
      platforms: ['linux'],
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
