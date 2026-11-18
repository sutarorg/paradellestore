import type { NextConfig } from 'next';

const host = process.env.PRODUCT_IMAGE_HOST;
const previewHost = process.env.E2B_SANDBOX_ID ? `3000-${process.env.E2B_SANDBOX_ID}.e2b.app` : undefined;
const config: NextConfig = {
  allowedDevOrigins: ['*.e2b.app'],
  devIndicators: false,
  poweredByHeader: false,
  experimental: {
    cpus: 2,
    serverActions: { bodySizeLimit: '6mb', allowedOrigins: previewHost ? [previewHost] : [] },
  },
  images: {
    remotePatterns: host ? [{ protocol: 'https', hostname: host, pathname: '/**' }] : [],
    deviceSizes: [360, 430, 640, 768, 1024, 1280, 1536, 1920],
    imageSizes: [64, 96, 128, 192, 256, 384],
    formats: ['image/webp'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'same-origin' },
          {
            key: 'Content-Security-Policy',
            value:
              "object-src 'none'; base-uri 'self'; form-action 'self' https://api.razorpay.com https://checkout.razorpay.com" +
              (process.env.VERCEL_ENV === 'production' ? "; frame-ancestors 'self'" : ''),
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      {
        source: '/admin/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Cache-Control', value: 'private, no-store' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
      {
        source: '/order-success',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ];
  },
};
export default config;
