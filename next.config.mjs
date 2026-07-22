import baseConfig from './next.config.cloudview-base.mjs';

const existingRewrites = baseConfig.rewrites;

const nextConfig = {
  ...baseConfig,

  async rewrites() {
    const existing =
      typeof existingRewrites === 'function'
        ? await existingRewrites()
        : [];

    const normalized = Array.isArray(existing)
      ? {
          beforeFiles: [],
          afterFiles: existing,
          fallback: [],
        }
      : {
          beforeFiles: existing?.beforeFiles ?? [],
          afterFiles: existing?.afterFiles ?? [],
          fallback: existing?.fallback ?? [],
        };

    return {
      beforeFiles: [
        {
          source: '/uploads/:path*',
          destination:
            '/api/runtime-uploads/:path*',
        },
        ...normalized.beforeFiles,
      ],

      afterFiles: normalized.afterFiles,
      fallback: normalized.fallback,
    };
  },
};

export default nextConfig;
