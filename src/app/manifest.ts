import type {
  MetadataRoute,
} from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LIA Marketplace",
    short_name: "LIA",
    description: "Local and international products delivered from independent stores.",
    id: "/home",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    background_color: "#f9fafb",
    theme_color: "#f97316",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icon/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
    screenshots: [
      {
        src: "/screenshots/lia-marketplace-mobile.png",
        sizes: "750x1334",
        type: "image/png",
        form_factor: "narrow",
        label: "LIA Marketplace on mobile",
      },
      {
        src: "/screenshots/lia-marketplace-wide.png",
        sizes: "1280x720",
        type: "image/png",
        form_factor: "wide",
        label: "LIA Marketplace on desktop",
      },
    ],
    shortcuts: [
      {
        name: "Browse stores",
        short_name: "Stores",
        description: "Browse stores available through LIA",
        url: "/home",
        icons: [{src: "/icon/icon-192.png", sizes: "192x192", type: "image/png"}],
      },
      {
        name: "Search products",
        short_name: "Search",
        description: "Search stores and products",
        url: "/search",
        icons: [{src: "/icon/icon-192.png", sizes: "192x192", type: "image/png"}],
      },
      {
        name: "Your orders",
        short_name: "Orders",
        description: "Review and track your orders",
        url: "/orders",
        icons: [{src: "/icon/icon-192.png", sizes: "192x192", type: "image/png"}],
      },
    ],
  };
}
