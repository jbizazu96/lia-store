import type {Metadata} from "next";
import {Inter} from "next/font/google";
import "./globals.css";
import {AuthProvider} from "@/context/AuthContext";
import {NotificationProvider} from "@/context/NotificationContext";
import {CartProvider} from "@/context/CartContext";

const inter = Inter({subsets: ["latin"]});

export const metadata: Metadata = {
  title: "LIA - Local International African Marketplace",
  description: "African groceries delivered from local stores",
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
            <CartProvider>
              <div className="min-h-screen flex flex-col">
                <main className="flex-1">
                  {children}
                </main>
              </div>
            </CartProvider>
          </NotificationProvider>
        </AuthProvider>
      </body>
    </html>
  );
}