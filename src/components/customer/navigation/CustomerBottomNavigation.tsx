"use client";

/*
|--------------------------------------------------------------------------
| Customer Bottom Navigation
|--------------------------------------------------------------------------
|
| The customer app has its primary destinations and Support. This glass navigation is
| deliberately floating, keeping page content visible behind it while giving
| mobile customers a consistent way to move between those destinations.
|
*/

import Link from "next/link";
import {
  CircleHelp,
  House,
  Package,
  UserRound,
} from "lucide-react";
import {
  usePathname,
} from "next/navigation";
import {
  useCustomerOrdersContext,
} from "@/context/CustomerOrdersContext";

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
    label: "Support",
    href: "/help?from=customer",
    icon: CircleHelp,
    matches: (pathname: string) => pathname.startsWith("/help"),
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
  const {
    openOrderCount,
  } = useCustomerOrdersContext();

  return (
    <nav
      aria-label="Customer navigation"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-[30px] border border-gray-900/[0.08] bg-white/[0.03] p-1.5 shadow-[0_12px_30px_rgba(15,23,42,0.10)] backdrop-blur-2xl backdrop-saturate-150"
    >
      <div className="grid grid-cols-4 gap-1">
        {navigationItems.map((item) => {
          const active = item.matches(pathname);
          const Icon = item.icon;
          const showOrderBadge =
            item.href === "/orders" &&
            openOrderCount > 0;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={
                "relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-[23px] border px-2 py-1.5 text-[11px] font-bold transition " +
                (active
                  ? "border-orange-400/80 text-orange-600"
                  : "border-transparent text-gray-700 hover:bg-white/40 hover:text-gray-950")
              }
            >
              <span className="relative">
                <Icon className="h-5 w-5" strokeWidth={2.4} />
                {showOrderBadge && (
                  <span className="absolute -right-3 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[9px] font-extrabold text-white shadow-sm">
                    {openOrderCount > 99 ? "99+" : openOrderCount}
                  </span>
                )}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
