"use client";

/*
|--------------------------------------------------------------------------
| Status Badge
|--------------------------------------------------------------------------
|
| Displays a consistent order-status badge using the centralized
| order-status configuration.
|
*/

import {
  ORDER_STATUS_CONFIG,
} from "@/config/orderStatus";

interface StatusBadgeProps {
  status: string;
  showIcon?: boolean;
  size?: "sm" | "md" | "lg";
}

export function StatusBadge({
  status,
  showIcon = true,
  size = "md",
}: StatusBadgeProps) {
  const config =
    status in ORDER_STATUS_CONFIG
      ? ORDER_STATUS_CONFIG[
          status as keyof typeof ORDER_STATUS_CONFIG
        ]
      : ORDER_STATUS_CONFIG.pending;

  const Icon = config.icon;

  const sizeClasses = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-3 py-1 text-sm",
    lg: "px-4 py-1.5 text-base",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${sizeClasses[size]} ${config.color}`}
    >
      {showIcon && (
        <Icon className="h-3.5 w-3.5" />
      )}

      {config.label}
    </span>
  );
}