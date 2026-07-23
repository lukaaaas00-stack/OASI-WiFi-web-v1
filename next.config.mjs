import { existsSync } from 'node:fs'
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js'

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  devIndicators: false,
  allowedDevOrigins: ['**.*'],
  logging: {
    browserToTerminal: 'error',
  },
}

// tsconfig.teable.json exists only in the Teable sandbox (injected, gitignored);
// the dev-phase guard keeps production builds on the app's own tsconfig.
export default (phase) =>
  phase === PHASE_DEVELOPMENT_SERVER && existsSync('./tsconfig.teable.json')
    ? {
        ...nextConfig,
        typescript: { ...nextConfig.typescript, tsconfigPath: 'tsconfig.teable.json' },
      }
    : nextConfig
