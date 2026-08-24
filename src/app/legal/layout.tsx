import type {Metadata} from "next";

/*
 * Legal documents must remain publicly accessible for customers and app-store
 * compliance, but the public marketplace homepage is LIA's only search result.
 * Keeping these routes crawlable lets search engines observe the noindex rule.
 */
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: true,
    googleBot: {
      index: false,
      follow: true,
    },
  },
};

export default function LegalLayout({children}: {children: React.ReactNode}) {
  return children;
}
