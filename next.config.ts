/// <reference types="node" />

/* eslint-disable @typescript-eslint/no-require-imports */
import type {NextConfig} from "next";

interface RuntimeCacheMatchContext {
  request: Request;
  url: URL;
}

const withPwa = require("next-pwa")({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  clientsClaim: true,
  cleanupOutdatedCaches: true,
  cacheStartUrl: false,
  dynamicStartUrl: false,
  reloadOnOnline: true,
  buildExcludes: [/app-build-manifest\.json$/, /server-reference-manifest\.json$/, /.*\.html$/],
  runtimeCaching: [
    {
      // Internet is required: never satisfy a page navigation from an old shell.
      urlPattern: ({request}: RuntimeCacheMatchContext) =>
        request.mode === "navigate",
      handler: "NetworkOnly",
      options: {cacheName: "lia-network-only-pages"},
    },
    {
      // Pricing, inventory, checkout, orders, and Firebase APIs are authoritative.
      urlPattern: ({request, url}: RuntimeCacheMatchContext) =>
        url.pathname.startsWith("/api/") ||
        (request.destination !== "image" && url.hostname.endsWith("googleapis.com")) ||
        url.hostname.endsWith("firebaseio.com") ||
        url.hostname.endsWith("cloudfunctions.net") ||
        url.hostname.endsWith("stripe.com"),
      handler: "NetworkOnly",
      options: {cacheName: "lia-network-only-data"},
    },
    {
      urlPattern: ({request, url}: RuntimeCacheMatchContext) =>
        request.destination === "image" &&
        (url.origin === self.location.origin ||
          url.hostname === "firebasestorage.googleapis.com" ||
          url.hostname === "storage.googleapis.com" ||
          url.hostname === "lh3.googleusercontent.com" ||
          url.hostname === "maps.googleapis.com"),
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "lia-safe-images-v1",
        expiration: {maxEntries: 250, maxAgeSeconds: 7 * 24 * 60 * 60},
        cacheableResponse: {statuses: [0, 200]},
      },
    },
    {
      urlPattern: ({request, url}: RuntimeCacheMatchContext) =>
        url.origin === self.location.origin &&
        ["script", "style", "font", "worker"].includes(request.destination),
      handler: "CacheFirst",
      options: {
        cacheName: "lia-static-assets-v1",
        expiration: {maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60},
        cacheableResponse: {statuses: [0, 200]},
      },
    },
  ],
});

const nextConfig: NextConfig = {
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
      {
        protocol: 'https',
        hostname: 'maps.googleapis.com',
        port: '',
        pathname: '/maps/api/staticmap',
      },
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default withPwa(nextConfig);
