import type {Metadata} from "next";
import {Inter} from "next/font/google";
import "./globals.css";
import {BottomNavigation} from "@/components/navigation/BottomNavigation";
import {AuthProvider} from "@/context/AuthContext";

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
          <div className="min-h-screen flex flex-col">
            <main className="flex-1">
              {children}
            </main>
            <BottomNavigation />
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}