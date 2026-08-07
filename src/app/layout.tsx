import type {
  Metadata,
  Viewport,
} from "next";
import {Inter} from "next/font/google";
import "./globals.css";
import {AuthProvider} from "@/context/AuthContext";
import {NotificationProvider} from "@/context/NotificationContext";
import {CartProvider} from "@/context/CartContext";
import {ConfirmationProvider} from "@/context/ConfirmationContext";
import {SuccessToastProvider} from "@/context/SuccessToastContext";

const inter = Inter({subsets: ["latin"]});

export const metadata: Metadata = {
  title: "LIA - Local International African Marketplace",
  description: "African groceries delivered from local stores",
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
      <body className={inter.className}>
        <AuthProvider>
          <NotificationProvider>
            <ConfirmationProvider>
              <SuccessToastProvider>
                <CartProvider>
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
