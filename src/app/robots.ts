import type {MetadataRoute} from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin/",
        "/driver/",
        "/checkout/",
        "/cart",
        "/home",
        "/notifications",
        "/orders",
        "/profile",
        "/search",
        "/login",
        "/register",
        "/store/dashboard",
        "/store/analytics",
        "/store/earnings",
        "/store/notifications",
        "/store/onboarding",
        "/store/pending-approval",
        "/store/products",
        "/store/settings",
        "/store/store-orders",
      ],
    },
    sitemap: "https://www.liamarketplace.com/sitemap.xml",
    host: "https://www.liamarketplace.com",
  };
}
