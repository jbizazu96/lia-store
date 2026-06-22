/** @type {import('next').NextConfig} */
const nextConfig = {
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

module.exports = nextConfig;