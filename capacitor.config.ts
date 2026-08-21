/// <reference types="@capacitor-firebase/authentication" />
/// <reference types="@capacitor-firebase/crashlytics" />
/// <reference types="@capacitor-firebase/messaging" />

import type { CapacitorConfig } from "@capacitor/cli";

const hostedAppUrl = process.env.CAPACITOR_SERVER_URL?.trim() ||
  "https://www.liamarketplace.com";

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
    SplashScreen: {
      // Keep the native launch screen visible while the hosted Next.js shell
      // initializes, then let Capacitor hand off to the branded route loader.
      launchAutoHide: true,
      launchShowDuration: 2000,
      backgroundColor: "#ffffff",
      showSpinner: false,
      androidScaleType: "CENTER",
      splashFullScreen: true,
      splashImmersive: true,
    },
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ["google.com", "apple.com"],
    },
    FirebaseMessaging: {
      presentationOptions: ["alert", "badge", "sound"],
    },
  },
  experimental: {
    ios: {
      spm: {
        packageOptions: {
          "@capacitor-firebase/messaging": {
            symlink: true,
          },
          "@capacitor-firebase/crashlytics": {
            symlink: true,
          },
        },
      },
    },
  },
};

export default config;
