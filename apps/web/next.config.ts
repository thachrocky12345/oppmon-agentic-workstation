import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Standalone disabled on Windows due to symlink issues
  // output: 'standalone',

  // API rewrites: forward /api/* server-side to the real backend.
  // INTERNAL_API_URL is server-only (resolved at runtime, not baked into the
  // browser bundle) so we can change the backend host without a rebuild.
  async rewrites() {
    const apiUrl = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },

  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },

  // Strict mode for better debugging
  reactStrictMode: true,

  // Experimental features
  experimental: {
    // Enable server actions
    serverActions: {
      allowedOrigins: ['localhost:3002'],
    },
  },
};

export default nextConfig;
