"use client";

import { useNotifications } from "@/context/NotificationContext";
import Link from "next/link";
import {Bell, CircleHelp, ShoppingCart} from "lucide-react";
import Image from "next/image";
import {useCart} from "@/context/CartContext";
import { useRouter } from "next/navigation";

export function TopNavigation() {
  const {itemCount} = useCart();
  const { unreadCount } = useNotifications();
  const router = useRouter();

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200/70 bg-gray-50/95 backdrop-blur-xl">
      <div className="px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href="/home" className="flex items-center gap-2">
            <div className="relative w-8 h-8">
              <Image
                src="/icon/icon-192.png"
                alt=" LIA Logo"
                fill
                className="w-12 h-12 object-contain"
              />
            </div>
            <span className="text-lg font-bold text-green-800"></span>
          </Link>

          {/* Main navigation lives in the floating bottom bar. */}
          <div className="flex items-center gap-1">
            <Link
              href="/help?from=customer"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200/80 transition hover:bg-gray-300"
              aria-label="Help and support"
            >
              <CircleHelp className="h-5 w-5 text-gray-700" />
            </Link>

            {/* Notifications */}
            <button
              onClick={() => router.push("/notifications")}
              className="relative w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5 text-gray-600" />

              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                  {unreadCount > 99
                    ? "99+"
                    : unreadCount}
                </span>
              )}
            </button>

            {/* Cart */}
            <Link 
              href="/cart" 
              className="relative w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition"
              aria-label="Cart"
            >
              <ShoppingCart className="w-5 h-5 text-gray-600" />
              {itemCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-4 bg-orange-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                  {itemCount > 99 ? "99+" : itemCount}
                </span>
              )}
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
