"use client";

import Link from "next/link";
import {User, Bell, ShoppingCart, Package, Search} from "lucide-react";
import Image from "next/image";
import {useCart} from "@/context/CartContext";

interface TopNavigationProps {
  userName: string;
}

export function TopNavigation({userName}: TopNavigationProps) {
  const {itemCount} = useCart();

  return (
    <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
      <div className="px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="relative w-8 h-8">
              <Image
                src="/logo.png"
                alt="LIA"
                fill
                className="object-contain"
              />
            </div>
            <span className="text-lg font-bold text-green-800">LIA</span>
          </div>

          {/* Right: Icons with gray backgrounds */}
          <div className="flex items-center gap-1">
            {/* Search Icon */}
            <button 
              className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition"
              aria-label="Search"
            >
              <Search className="w-5 h-5 text-gray-600" />
            </button>

            {/* Orders */}
            <Link 
              href="/orders" 
              className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition"
              aria-label="My Orders"
            >
              <Package className="w-5 h-5 text-gray-600" />
            </Link>

            {/* Notifications */}
            <button 
              className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition relative"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5 text-gray-600" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full" />
            </button>

            {/* Profile */}
            <Link 
              href="/profile" 
              className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition"
              aria-label="Profile"
            >
              <User className="w-5 h-5 text-gray-600" />
            </Link>

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