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

const contentSecurityPolicyReportOnly = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "manifest-src 'self'",
  "worker-src 'self' blob:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://accounts.google.com https://www.google.com https://www.recaptcha.net https://appleid.apple.com https://*.googleapis.com https://*.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://firebasestorage.googleapis.com https://storage.googleapis.com https://lh3.googleusercontent.com https://*.googleusercontent.com https://maps.googleapis.com https://*.gstatic.com",
  "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.cloudfunctions.net https://*.google.com https://*.recaptcha.net https://*.stripe.com https://api.stripe.com",
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://*.firebaseapp.com https://accounts.google.com https://www.google.com https://www.recaptcha.net https://appleid.apple.com",
  "form-action 'self' https://*.stripe.com",
  "report-uri /api/csp-report",
].join("; ");

const nextConfig: NextConfig = {
  /*
   * next-pwa contributes a webpack hook for production service-worker
   * generation. Development deliberately uses Turbopack and disables PWA,
   * so declare the Turbopack configuration explicitly to avoid Next 16
   * treating the two build systems as an accidental conflict.
   */
  turbopack: {},
  async headers() {
    const securityHeaders = [
      {key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicyReportOnly},
      {key: "X-Content-Type-Options", value: "nosniff"},
      {key: "Referrer-Policy", value: "strict-origin-when-cross-origin"},
      {key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self), payment=(self \"https://js.stripe.com\")"},
      {key: "X-Frame-Options", value: "DENY"},
    ];
    const serviceWorkerHeaders = [
      {key: "Cache-Control", value: "public, max-age=0, must-revalidate"},
      {key: "CDN-Cache-Control", value: "public, max-age=0, must-revalidate"},
      {key: "Vercel-CDN-Cache-Control", value: "public, max-age=0, must-revalidate"},
    ];

    return [
      {source: "/:path*", headers: securityHeaders},
      {source: "/sw.js", headers: serviceWorkerHeaders},
      {source: "/firebase-messaging-sw.js", headers: serviceWorkerHeaders},
    ];
  },
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
