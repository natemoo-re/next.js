import chalk from 'chalk'
import findUp from 'find-up'
import os from 'os'
import { basename, extname } from 'path'
import webpack from 'webpack'
import { CONFIG_FILE } from '../lib/constants'
import { execOnce } from '../lib/utils'

export type NextTarget =
  | 'server'
  | 'serverless'
  | 'experimental-serverless-trace'
const targets: NextTarget[] = [
  'server',
  'serverless',
  'experimental-serverless-trace',
]

interface Webpack {
  (options: webpack.Configuration, handler: webpack.Compiler.Handler):
    | webpack.Compiler.Watching
    | webpack.Compiler
  (options?: webpack.Configuration): webpack.Compiler

  (options: webpack.Configuration[], handler: webpack.MultiCompiler.Handler):
    | webpack.MultiWatching
    | webpack.MultiCompiler
  (options: webpack.Configuration[]): webpack.MultiCompiler
}

export type ReactMode = 'legacy' | 'blocking' | 'concurrent'
const reactModes: ReactMode[] = ['legacy', 'blocking', 'concurrent']

export interface NextExperimental {
  ampBindInitData?: boolean
  cpus?: number
  catchAllRouting?: boolean
  css?: boolean
  documentMiddleware?: boolean
  granularChunks?: boolean
  modern?: boolean
  plugins?: boolean
  profiling?: boolean
  sprFlushToDisk?: boolean
  deferScripts?: boolean
  reactMode?: ReactMode
  workerThreads?: boolean
}

export interface NextFuture {
  excludeDefaultMomentLocales?: false
}

export interface NextConfig {
  env?: any[]
  webpack?: Webpack
  webpackDevMiddleware?: any
  distDir?: string
  assetPrefix?: string
  configOrigin?: string
  useFileSystemPublicRoutes?: boolean
  generateBuildId?: () => number | string | null | void
  generateEtags?: boolean
  pageExtensions?: string[]
  target?: NextTarget
  poweredByHeader?: boolean
  compress?: boolean
  devIndicators?: {
    buildActivity?: boolean
    autoPrerender?: boolean
  }
  onDemandEntries?: {
    maxInactiveAge?: number
    pagesBufferLength?: number
  }
  amp?: {
    canonicalBase?: string
  }
  exportTrailingSlash?: boolean
  experimental?: NextExperimental
  future?: NextFuture
  serverRuntimeConfig?: { [key: string]: any }
  publicRuntimeConfig?: { [key: string]: any }
  reactStrictMode?: false
  [key: string]: any
}

const defaultConfig: NextConfig = {
  env: [],
  webpack: null as any,
  webpackDevMiddleware: null,
  distDir: '.next',
  assetPrefix: '',
  configOrigin: 'default',
  useFileSystemPublicRoutes: true,
  generateBuildId: () => null,
  generateEtags: true,
  pageExtensions: ['tsx', 'ts', 'jsx', 'js'],
  target: 'server',
  poweredByHeader: true,
  compress: true,
  devIndicators: {
    buildActivity: true,
    autoPrerender: true,
  },
  onDemandEntries: {
    maxInactiveAge: 60 * 1000,
    pagesBufferLength: 2,
  },
  amp: {
    canonicalBase: '',
  },
  exportTrailingSlash: false,
  experimental: {
    ampBindInitData: false,
    cpus: Math.max(
      1,
      (Number(process.env.CIRCLE_NODE_TOTAL) ||
        (os.cpus() || { length: 1 }).length) - 1
    ),
    catchAllRouting: false,
    css: false,
    documentMiddleware: false,
    granularChunks: false,
    modern: false,
    plugins: false,
    profiling: false,
    sprFlushToDisk: true,
    deferScripts: false,
    reactMode: 'legacy',
    workerThreads: false,
  },
  future: {
    excludeDefaultMomentLocales: false,
  },
  serverRuntimeConfig: {},
  publicRuntimeConfig: {},
  reactStrictMode: false,
}

const experimentalWarning = execOnce(() => {
  console.warn(
    chalk.yellow.bold('Warning: ') +
      chalk.bold('You have enabled experimental feature(s).')
  )
  console.warn(
    `Experimental features are not covered by semver, and may cause unexpected or broken application behavior. ` +
      `Use them at your own risk.`
  )
  console.warn()
})

function assignDefaults(userConfig: { [key: string]: any }) {
  Object.keys(userConfig).forEach((key: string) => {
    if (
      key === 'experimental' &&
      userConfig[key] &&
      userConfig[key] !== defaultConfig[key]
    ) {
      experimentalWarning()
    }

    if (key === 'distDir' && userConfig[key] === 'public') {
      throw new Error(
        `The 'public' directory is reserved in Next.js and can not be set as the 'distDir'. https://err.sh/zeit/next.js/can-not-output-to-public`
      )
    }

    const maybeObject = userConfig[key]
    if (!!maybeObject && maybeObject.constructor === Object) {
      userConfig[key] = {
        ...(defaultConfig[key] || {}),
        ...userConfig[key],
      }
    }
  })

  return { ...defaultConfig, ...userConfig }
}

function normalizeConfig(phase: string, config: any) {
  if (typeof config === 'function') {
    config = config(phase, { defaultConfig })

    if (typeof config.then === 'function') {
      throw new Error(
        '> Promise returned in next config. https://err.sh/zeit/next.js/promise-in-next-config'
      )
    }
  }
  return config
}

export default function loadConfig(
  phase: string,
  dir: string,
  customConfig?: object | null
) {
  if (customConfig) {
    return assignDefaults({ configOrigin: 'server', ...customConfig })
  }

  const configBaseName = basename(CONFIG_FILE, extname(CONFIG_FILE))
  const path = findUp.sync([`${configBaseName}.js`, `${configBaseName}.ts`], {
    cwd: dir,
  })

  // If config file was found
  if (path && path.length) {
    const userConfigModule = require(path)
    const userConfig = normalizeConfig(
      phase,
      userConfigModule.default || userConfigModule
    )
    if (userConfig.target && !targets.includes(userConfig.target)) {
      throw new Error(
        `Specified target is invalid. Provided: "${
          userConfig.target
        }" should be one of ${targets.join(', ')}`
      )
    }

    if (userConfig.amp && userConfig.amp.canonicalBase) {
      const { canonicalBase } = userConfig.amp || ({} as any)
      userConfig.amp = userConfig.amp || {}
      userConfig.amp.canonicalBase =
        (canonicalBase.endsWith('/')
          ? canonicalBase.slice(0, -1)
          : canonicalBase) || ''
    }

    if (
      userConfig.target &&
      userConfig.target !== 'server' &&
      ((userConfig.publicRuntimeConfig &&
        Object.keys(userConfig.publicRuntimeConfig).length !== 0) ||
        (userConfig.serverRuntimeConfig &&
          Object.keys(userConfig.serverRuntimeConfig).length !== 0))
    ) {
      // TODO: change error message tone to "Only compatible with [fat] server mode"
      throw new Error(
        'Cannot use publicRuntimeConfig or serverRuntimeConfig with target=serverless https://err.sh/zeit/next.js/serverless-publicRuntimeConfig'
      )
    }

    if (
      userConfig.experimental &&
      userConfig.experimental.reactMode &&
      !reactModes.includes(userConfig.experimental.reactMode)
    ) {
      throw new Error(
        `Specified React Mode is invalid. Provided: ${
          userConfig.experimental.reactMode
        } should be one of ${reactModes.join(', ')}`
      )
    }

    return assignDefaults({ configOrigin: CONFIG_FILE, ...userConfig })
  } else {
    const configBaseName = basename(CONFIG_FILE, extname(CONFIG_FILE))
    const nonJsPath = findUp.sync(
      [
        `${configBaseName}.jsx`,
        `${configBaseName}.tsx`,
        `${configBaseName}.json`,
      ],
      { cwd: dir }
    )
    if (nonJsPath && nonJsPath.length) {
      throw new Error(
        `Configuring Next.js via '${basename(
          nonJsPath
        )}' is not supported. Please replace the file with 'next.config.js' or 'next.config.ts'.`
      )
    }
  }

  return defaultConfig
}

export function isTargetLikeServerless(target: string) {
  const isServerless = target === 'serverless'
  const isServerlessTrace = target === 'experimental-serverless-trace'
  return isServerless || isServerlessTrace
}
