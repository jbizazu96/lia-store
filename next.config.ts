const withPwa = require("next-pwa")({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  fallbacks: {
    document: "/offline",
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  /*
   * next-pwa contributes a webpack hook for production service-worker
   * generation. Development deliberately uses Turbopack and disables PWA,
   * so declare the Turbopack configuration explicitly to avoid Next 16
   * treating the two build systems as an accidental conflict.
   */
  turbopack: {},
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        port: '',
        pathname: '/v0/b/**',
      },
      // Add other domains if needed
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com', // For Google profile images
        port: '',
        pathname: '/**',
      },
    ],
  },
};

module.exports = withPwa(nextConfig);
