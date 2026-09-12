import type { NextConfig } from 'next';
import { SECURITY_HEADERS } from './src/shared/security-headers.mjs';

const nextConfig: NextConfig = {
  output: 'standalone',
  // sharp (native image lib) cannot run on Workers. `/_next/image` is served
  // by OpenNext's own handler, so keep sharp external and never bundle it.
  serverExternalPackages: ['sharp'],
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  // NOTE (Cloudflare Workers): Cache Components rely on setTimeout()
  // semantics the Workers runtime cannot guarantee, which hangs every SSR
  // page. Keep it off on this target; dynamic routes use force-dynamic.
  cacheComponents: false,
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'motion', 'echarts'],
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
