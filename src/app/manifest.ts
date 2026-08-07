import type {
  MetadataRoute,
} from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LIA Marketplace",
    short_name: "LIA",
    description: "African groceries delivered from local stores.",
    start_url: "/home",
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
        src: "/icon/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
