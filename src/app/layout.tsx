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

export const metadata: Metadata = {
  title: "LIA Marketplace | Local delivery for independent stores",
  description: "Shop local and international products from independent stores, delivered to your door.",
  applicationName: "LIA Marketplace",
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
