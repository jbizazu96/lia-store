import type {
  Metadata,
  Viewport,
} from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import {AuthProvider} from "@/context/AuthContext";
import {NotificationProvider} from "@/context/NotificationContext";
import {CartProvider} from "@/context/CartContext";
import {ConfirmationProvider} from "@/context/ConfirmationContext";
import {SuccessToastProvider} from "@/context/SuccessToastContext";
import {NativeCustomerBridge} from "@/components/customer/native/NativeCustomerBridge";
import {GlobalClientErrorReporter} from "@/components/monitoring/GlobalClientErrorReporter";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.liamarketplace.com"),
  title: "LIA Marketplace | Local delivery for independent stores",
  description: "Shop local and international products from independent stores, delivered to your door.",
  applicationName: "LIA Marketplace",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "LIA Marketplace",
    title: "LIA Marketplace | Local delivery for independent stores",
    description: "Shop local and international products from independent stores, delivered to your door.",
    images: [{
      url: "/opengraph-image",
      width: 1200,
      height: 630,
      alt: "LIA Marketplace — shop independent local stores",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: "LIA Marketplace | Local delivery for independent stores",
    description: "Shop local and international products from independent stores, delivered to your door.",
    images: ["/opengraph-image"],
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "LIA",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icon/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/icon/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      { url: "/icon/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f97316",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <NotificationProvider>
            <ConfirmationProvider>
              <SuccessToastProvider>
                <CartProvider>
                  <NativeCustomerBridge />
                  <GlobalClientErrorReporter />
                  <div className="min-h-screen flex flex-col">
                    <main className="flex-1">
                      {children}
                    </main>
                  </div>
                </CartProvider>
              </SuccessToastProvider>
            </ConfirmationProvider>
          </NotificationProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
