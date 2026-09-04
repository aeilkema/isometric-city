const { withGTConfig } = require('gt-next/config');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  reactCompiler: true,
  poweredByHeader: false,

  async rewrites() {
    return {
      // The repository keeps PNG source artwork for editing, but every runtime
      // sprite sheet has a much smaller WebP sibling. Serving WebP here avoids
      // touching dozens of legacy sprite references while removing most image
      // transfer/decode overhead from the browser.
      beforeFiles: [
        {
          source: '/assets/:path*\\.png',
          destination: '/assets/:path*.webp',
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },

  async headers() {
    return [
      {
        source: '/assets/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
        ],
      },
    ];
  },
};

module.exports = withGTConfig(nextConfig);
