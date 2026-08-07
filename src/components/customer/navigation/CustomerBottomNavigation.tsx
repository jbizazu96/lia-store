"use client";

/*
|--------------------------------------------------------------------------
| Customer Bottom Navigation
|--------------------------------------------------------------------------
|
| The customer app has three primary destinations. This glass navigation is
| deliberately floating, keeping page content visible behind it while giving
| mobile customers a consistent way to move between those destinations.
|
*/

import Link from "next/link";
import {
  House,
  Package,
  UserRound,
} from "lucide-react";
import {
  usePathname,
} from "next/navigation";

const navigationItems = [
  {
    label: "Home",
    href: "/home",
    icon: House,
    matches: (pathname: string) => pathname === "/home",
  },
  {
    label: "Orders",
    href: "/orders",
    icon: Package,
    matches: (pathname: string) => pathname.startsWith("/orders"),
  },
  {
    label: "Profile",
    href: "/profile",
    icon: UserRound,
    matches: (pathname: string) => pathname.startsWith("/profile"),
  },
] as const;

export function CustomerBottomNavigation() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Customer navigation"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-xs rounded-[24px] border border-gray-900/10 bg-gray-900/[0.04] p-1 shadow-[0_10px_28px_rgba(15,23,42,0.14)] backdrop-blur-md"
    >
      <div className="grid grid-cols-3 gap-1">
        {navigationItems.map((item) => {
          const active = item.matches(pathname);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={
                "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-[18px] border px-2 py-1.5 text-[11px] font-bold transition " +
                (active
                  ? "border-orange-400 text-orange-600"
                  : "border-transparent text-gray-600 hover:bg-white/55 hover:text-gray-950")
              }
            >
              <Icon className="h-5 w-5" strokeWidth={2.4} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
