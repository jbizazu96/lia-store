import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "functions/lib/**",
    "public/sw.js",
    "public/workbox-*.js",
    "public/fallback-*.js",
    "playwright-report/**",
    "test-results/**",
    "coverage/**",
    // Capacitor copies compiled web assets into both generated native
    // projects. Lint the source once, not the synchronized build copies.
    "android/**",
    "ios/**",
  ]),
  {
    rules: {
      /*
       * These React 19 rules identify worthwhile refactors, but existing
       * Firebase subscription and form-hydration effects are intentional.
       * Keep them visible without preventing deployments while those flows
       * are migrated incrementally.
       */
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react/no-unescaped-entities": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@next/next/no-html-link-for-pages": "warn",
    },
  },
  {
    files: [
      "src/app/(customer)/**/*.{ts,tsx}",
      "src/app/login/**/*.{ts,tsx}",
      "src/app/register/**/*.{ts,tsx}",
      "src/app/reset-password/**/*.{ts,tsx}",
      "src/components/customer/**/*.{ts,tsx}",
      "src/components/checkout/**/*.{ts,tsx}",
      "src/hooks/useCheckout*.{ts,tsx}",
    ],
    rules: {
      // Customer actions must use LIA dialogs and inline messages, never
      // browser-native alert, confirm, or prompt windows.
      "no-alert": "error",
      "no-restricted-globals": [
        "error",
        {name: "alert", message: "Use a LIA in-app dialog or inline message."},
        {name: "confirm", message: "Use ConfirmationContext for customer confirmations."},
        {name: "prompt", message: "Use a LIA in-app form."},
      ],
    },
  },
  {
    files: [
      "src/app/store/**/*.{ts,tsx}",
      "src/components/store/**/*.{ts,tsx}",
      "src/hooks/useStore*.{ts,tsx}",
      "src/services/store/**/*.{ts,tsx}",
    ],
    rules: {
      // Store actions must use LIA dialogs and inline messages, never
      // browser-native alert, confirm, or prompt windows.
      "no-alert": "error",
      "no-restricted-globals": [
        "error",
        {name: "alert", message: "Use a LIA in-app dialog or inline message."},
        {name: "confirm", message: "Use ConfirmationContext for store confirmations."},
        {name: "prompt", message: "Use a LIA in-app form."},
      ],
    },
  },
  {
    files: [
      "src/app/admin/**/*.{ts,tsx}",
      "src/components/admin/**/*.{ts,tsx}",
      "src/services/admin/**/*.{ts,tsx}",
    ],
    rules: {
      // Administrator actions must remain inside the LIA workspace instead
      // of using browser-native alerts, confirmations, or prompts.
      "no-alert": "error",
      "no-restricted-globals": [
        "error",
        {name: "alert", message: "Use an admin in-app dialog or inline message."},
        {name: "confirm", message: "Use AdminConfirmationContext for administrator confirmations."},
        {name: "prompt", message: "Use an admin in-app form."},
      ],
    },
  },
  {
    files: [
      "src/app/driver/**/*.{ts,tsx}",
      "src/components/driver/**/*.{ts,tsx}",
      "src/hooks/useDriver*.{ts,tsx}",
      "src/services/driver/**/*.{ts,tsx}",
    ],
    rules: {
      // Driver actions must use LIA dialogs and inline messages instead of
      // browser-native alerts, confirmations, or prompts.
      "no-alert": "error",
      "no-restricted-globals": [
        "error",
        {name: "alert", message: "Use a LIA in-app dialog or inline message."},
        {name: "confirm", message: "Use ConfirmationContext for driver confirmations."},
        {name: "prompt", message: "Use a LIA in-app form."},
      ],
    },
  },
]);

export default eslintConfig;
