import type {MetadataRoute} from "next";

const siteUrl = "https://www.liamarketplace.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {url: siteUrl, changeFrequency: "weekly", priority: 1},
    {url: `${siteUrl}/legal`, changeFrequency: "monthly", priority: 0.6},
    {url: `${siteUrl}/legal/customer-terms`, changeFrequency: "monthly", priority: 0.5},
    {url: `${siteUrl}/legal/privacy`, changeFrequency: "monthly", priority: 0.5},
    {url: `${siteUrl}/legal/refund-policy`, changeFrequency: "monthly", priority: 0.5},
    {url: `${siteUrl}/legal/account-deletion`, changeFrequency: "monthly", priority: 0.5},
  ];
}
