import path from 'node:path';
import type { NextConfig } from 'next';

const config: NextConfig = {
  agentRules: false,
  output: 'standalone',
  outputFileTracingRoot: path.resolve(process.cwd(), '../..'),
  transpilePackages: [
    '@journal/ui',
    '@journal/contracts',
    '@journal/server',
    '@journal/database',
    '@journal/domain',
  ],
  allowedDevOrigins: ['localhost', '127.0.0.1'],
  poweredByHeader: false,
  experimental: { cpus: 2 },
  webpack(webpackConfig) {
    // Workspace sources use Node-compatible .js specifiers before compilation.
    webpackConfig.resolve.extensionAlias = {
      ...webpackConfig.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return webpackConfig;
  },
};

export default config;
