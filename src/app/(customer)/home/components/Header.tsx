"use client";

import Link from "next/link";
import {ShoppingCart, User} from "lucide-react";
import Image from "next/image";

interface HeaderProps {
  userName: string;
  cartCount: number;
}

export function Header({userName, cartCount}: HeaderProps) {
  return (
    <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
      <div className="px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Left: Greeting */}
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10">
              <Image
                src="/icon/icon-512.png"
                alt="LIA"
                fill
                className="object-contain"
              />
            </div>
            <div>
              <p className="text-xs text-gray-500">Hello,</p>
              <p className="font-semibold text-gray-800">{userName}</p>
            </div>
          </div>

          {/* Right: Cart */}
          <Link href="/cart" className="relative">
            <div className="w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center hover:bg-gray-100 transition">
              <ShoppingCart className="w-5 h-5 text-gray-700" />
            </div>
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-orange-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}