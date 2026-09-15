import path from 'node:path';
import type { NextConfig } from 'next';
import { SECURITY_HEADERS } from './src/shared/security-headers.mjs';

const nextConfig: NextConfig = {
  output: 'standalone',
  // sharp is used only by the separate BullMQ Node worker. Do not mark it as
  // a Next server external: OpenNext would copy its Windows-native .node
  // binaries into the Worker bundle. The Worker path uses unoptimized image
  // URLs, while the Node worker keeps sharp available for image.optimize jobs.
  outputFileTracingExcludes: {
    '/*': [
      './node_modules/sharp/**/*',
      './node_modules/@img/sharp-*/**/*',
      './node_modules/.pnpm/sharp@*/**/*',
      './node_modules/.pnpm/@img+sharp-*/**/*',
      './node_modules/.pnpm/**/node_modules/sharp/**/*',
      './node_modules/.pnpm/**/node_modules/@img/sharp-*/**/*',
      './node_modules/next/dist/server/image-optimizer.js',
      './node_modules/next/dist/server/image-optimizer.js.map',
      './node_modules/.pnpm/**/node_modules/next/dist/server/image-optimizer.js',
      './node_modules/.pnpm/**/node_modules/next/dist/server/image-optimizer.js.map',
    ],
  },
  reactStrictMode: true,
  // Next 16 stable React Compiler: reduce avoidable client re-renders.
  // The compiler plugin is pinned in devDependencies and is compatible with
  // the existing webpack/OpenNext build path.
  reactCompiler: true,
  poweredByHeader: false,
  compress: true,
  // NOTE (Cloudflare Workers): Cache Components rely on setTimeout()
  // semantics the Workers runtime cannot guarantee, which hangs every SSR
  // page. Keep it off on this target; dynamic routes use force-dynamic.
  cacheComponents: false,
  images: {
    // OpenNext routes image optimization to the Cloudflare Images binding
    // configured as IMAGES in wrangler.jsonc.
    formats: ['image/avif', 'image/webp'],
    // Deliberately open until the media-mirroring backfill completes:
    // supplier CSV rows and legacy records hotlink arbitrary image hosts,
    // and narrowing this to an allow-list would 400 every unmirrored photo.
    // Precondition for tightening: mirror 100% of product/category/content
    // images into our own bucket (see mirrorRemoteImage), then restrict to
    // [MEDIA_PUBLIC_BASE_URL, *.r2.dev, *.supabase.co, localhost].
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'motion', 'echarts'],
    // Keep mutations pending and retry them after connectivity returns.
    // The UI banner below exposes this state to shoppers.
    useOffline: true,
  },
  // pnpm's isolated dependency links can point Webpack at a partially
  // materialized package when a local install is interrupted. Resolve the
  // runtime entrypoints from the root dependency links, which are also the
  // paths used by the standalone production build. This does not change the
  // package versions or runtime behavior.
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      zod$: path.resolve(process.cwd(), 'node_modules/zod/index.js'),
      'zod/v3$': path.resolve(process.cwd(), 'node_modules/zod/v3/index.js'),
      'zod/v4$': path.resolve(process.cwd(), 'node_modules/zod/v4/index.js'),
      'bullmq/dist/esm/classes/queue.js': path.resolve(
        process.cwd(),
        'node_modules/bullmq/dist/esm/classes/queue.js',
      ),
      'bullmq/dist/esm/classes/worker.js': path.resolve(
        process.cwd(),
        'node_modules/bullmq/dist/esm/classes/worker.js',
      ),
    };
    return config;
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: Object.entries(SECURITY_HEADERS).map(([key, value]) => ({ key, value })),
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/manifest.webmanifest',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=3600, stale-while-revalidate=86400' },
          { key: 'Content-Type', value: 'application/manifest+json; charset=utf-8' },
        ],
      },
    ];
  },
};

export default nextConfig;
