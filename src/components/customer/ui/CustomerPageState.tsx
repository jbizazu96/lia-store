"use client";

import Link from "next/link";
import {
  AlertCircle,
  type LucideIcon,
  PackageOpen,
  RefreshCw,
  SearchX,
  ShoppingBag,
  WifiOff,
} from "lucide-react";

type CustomerPageStateKind = "empty" | "error" | "offline" | "search-empty";

interface CustomerPageStateProps {
  kind: CustomerPageStateKind;
  title: string;
  description: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  icon?: LucideIcon;
  compact?: boolean;
}

const defaultIcons: Record<CustomerPageStateKind, LucideIcon> = {
  empty: PackageOpen,
  error: AlertCircle,
  offline: WifiOff,
  "search-empty": SearchX,
};

/* Shared customer-facing empty, failed, offline, and no-results treatment. */
export function CustomerPageState({
  kind,
  title,
  description,
  action,
  icon: Icon = defaultIcons[kind],
  compact = false,
}: CustomerPageStateProps) {
  return (
    <section
      className={
        "mx-auto flex max-w-sm flex-col items-center px-6 text-center " +
        (compact ? "py-10" : "min-h-[52vh] justify-center py-16")
      }
    >
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-orange-100 bg-orange-50 text-orange-500 shadow-sm">
        <Icon className="h-8 w-8" aria-hidden="true" />
      </div>
      <h2 className="text-xl font-bold text-gray-900">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-gray-500">{description}</p>

      {action && (
        action.href ? (
          <Link
            href={action.href}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-orange-600"
          >
            <ShoppingBag className="h-4 w-4" aria-hidden="true" />
            {action.label}
          </Link>
        ) : (
          <button
            type="button"
            onClick={action.onClick}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-orange-600"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {action.label}
          </button>
        )
      )}
    </section>
  );
}
