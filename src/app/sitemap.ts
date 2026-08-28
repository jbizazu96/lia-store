import type {MetadataRoute} from "next";

const siteUrl = "https://www.liamarketplace.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {url: siteUrl, lastModified: new Date("2026-08-28"), changeFrequency: "weekly", priority: 1},
  ];
}
