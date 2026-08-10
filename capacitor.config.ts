/// <reference types="@capacitor-firebase/authentication" />

import type { CapacitorConfig } from "@capacitor/cli";

const hostedAppUrl = process.env.CAPACITOR_SERVER_URL?.trim();

const config: CapacitorConfig = {
  appId: "com.liamarketplace.customer",
  appName: "LIA",
  // The native shell loads the deployed Next.js app through server.url.
  // `public` remains the required local asset directory for Capacitor sync.
  webDir: "public",
  ...(hostedAppUrl
    ? {
        server: {
          url: hostedAppUrl,
          cleartext: hostedAppUrl.startsWith("http://"),
        },
      }
    : {}),
  plugins: {
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ["google.com"],
    },
  },
};

export default config;
