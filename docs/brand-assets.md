# LIA brand assets

The approved V5 LIA wordmark is the single source for customer, store, driver,
admin, PWA, future Capacitor, and print assets.

## Web and PWA

| File | Size | Use |
| --- | ---: | --- |
| `public/favicon.ico` | 16/32/48 | Browser compatibility favicon |
| `public/icon/favicon-16x16.png` | 16×16 | Browser favicon |
| `public/icon/favicon-32x32.png` | 32×32 | Browser favicon |
| `public/icon/favicon-48x48.png` | 48×48 | Browser/favicon fallback |
| `public/icon/favicon-96x96.png` | 96×96 | High-resolution favicon |
| `public/icon/icon-192.png` | 192×192 | PWA, notifications, shared workspace UI |
| `public/icon/icon-512.png` | 512×512 | PWA and shared workspace UI |
| `public/icon/icon-maskable-512.png` | 512×512 | Android maskable PWA icon |
| `public/icon/apple-touch-icon.png` | 180×180 | iPhone/iPad Home Screen PWA |

All app workspaces use the shared `/icon/icon-192.png` and
`/icon/icon-512.png` paths. Replacing those generated files updates customer,
store, driver, admin, onboarding, loaders, and web-notification branding.

## Website and email

| File | Use |
| --- | --- |
| `public/brand/lia-logo-transparent.png` | Full-resolution transparent master |
| `public/brand/lia-logo-transparent-512.png` | Standard transparent website/email logo |
| `public/brand/lia-logo-transparent-256.png` | Compact transparent website/email logo |
| `public/brand/lia-logo-white-background-512.png` | Placements requiring an opaque background |
| `public/logo.png` | Legacy route compatibility |

## Native source assets

The `assets/` directory is ready for Capacitor asset generation after the iOS
and Android projects are created.

| File | Size | Use |
| --- | ---: | --- |
| `assets/icon-only.png` | 1024×1024 | Opaque universal app icon source |
| `assets/icon-foreground.png` | 1024×1024 | Android adaptive foreground source |
| `assets/icon-background.png` | 1024×1024 | Android adaptive background source |
| `assets/splash.png` | 2732×2732 | Light native splash source |
| `assets/splash-dark.png` | 2732×2732 | Dark native splash source |

Prepared platform review files are under `public/brand/`, including the
1024×1024 iOS App Store icon, 512×512 Google Play icon, Android adaptive
layers, legacy density icons, and white Android notification silhouette.

## Apparel and print

The `assets/print/` directory contains 4500-pixel-wide transparent PNGs
tagged at 300 DPI:

- Full color for light garments.
- White-and-orange treatment for dark garments.
- One-color forest green for light garments and screen printing.
- One-color white for dark garments and screen printing.

These files are suitable for DTG, DTF, transfer, and many screen-print jobs.
Confirm garment color, printable area, ink requirements, and preferred color
profile with the printer before a production run.

## Regeneration

`scripts/generate_brand_assets.py` recreates all derived files from
`public/icon/lia-brand-concept-v5-transparent.png`. It requires Pillow.
