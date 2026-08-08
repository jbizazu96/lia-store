"use client";

import { useNotifications } from "@/context/NotificationContext";
import Link from "next/link";
import {Bell, ChevronDown, ShoppingCart} from "lucide-react";
import Image from "next/image";
import {useCart} from "@/context/CartContext";
import { useRouter } from "next/navigation";

interface TopNavigationProps {
  deliveryAddress?: string;
  onDeliveryAddressClick?: () => void;
}

export function TopNavigation({
  deliveryAddress,
  onDeliveryAddressClick,
}: TopNavigationProps) {
  const {itemCount} = useCart();
  const { unreadCount } = useNotifications();
  const router = useRouter();

  return (
    <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/95 backdrop-blur-xl">
      <div className="px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {/* Logo */}
            <Link href="/home" className="shrink-0">
            <div className="relative w-8 h-8">
              <Image
                src="/icon/icon-192.png"
                alt=" LIA Logo"
                fill
                sizes="32px"
                className="w-12 h-12 object-contain"
              />
            </div>
            </Link>

            <button
              type="button"
              onClick={onDeliveryAddressClick}
              className="flex min-w-0 items-center gap-1 rounded-lg py-1 text-left transition hover:text-orange-600"
              aria-label={
                deliveryAddress
                  ? "Change delivery address"
                  : "Add a delivery address"
              }
            >
              <span className="truncate text-sm font-bold text-gray-800">
                {deliveryAddress || "Add delivery address"}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />
            </button>
          </div>

          {/* Navigation and Support live in the floating bottom bar. */}
          <div className="ml-2 flex shrink-0 items-center gap-1">
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
