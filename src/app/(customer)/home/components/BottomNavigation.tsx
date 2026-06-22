"use client";

import Link from "next/link";
import {Home, ShoppingBag, User, Package} from "lucide-react";

interface BottomNavigationProps {
  active: "home" | "orders" | "profile";
}

export function BottomNavigation({active}: BottomNavigationProps) {
  const navItems = [
    {name: "Home", icon: Home, href: "/home"},
    {name: "My orders", icon: Package, href: "/orders"},
    {name: "Profile", icon: User, href: "/profile"},
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
      <div className="flex items-center justify-around max-w-md mx-auto h-16 px-4">
        {navItems.map((item) => {
          const isActive = active === item.name.toLowerCase().replace(" ", "");
          return (
            <Link
              key={item.name}
              href={item.href}
              className="flex flex-col items-center gap-0.5 group"
              aria-label={item.name}
            >
              <div className={`p-1.5 rounded-full transition ${
                isActive ? "text-orange-600" : "text-gray-500"
              }`}>
                <item.icon className={`w-6 h-6 transition ${
                  isActive ? "text-orange-600" : "text-gray-500"
                }`} />
              </div>
              <span className={`text-xs font-medium transition ${
                isActive ? "text-orange-600" : "text-gray-500"
              }`}>
                {item.name}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}