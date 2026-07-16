"use client";

/*
  Status badge component with consistent colors.
*/

import {Clock, CheckCircle, Package, Truck, XCircle} from "lucide-react";

interface StatusBadgeProps {
  status: string;
  showIcon?: boolean;
  size?: "sm" | "md" | "lg";
}

export function StatusBadge({status, showIcon = true, size = "md"}: StatusBadgeProps) {
  // Status configurations
  const statusConfig: Record<string, {label: string; color: string; icon: any}> = {
    pending: {
      label: "Pending",
      color: "bg-yellow-100 text-yellow-800 border-yellow-200",
      icon: Clock,
    },
    accepted: {
      label: "Accepted",
      color: "bg-blue-100 text-blue-800 border-blue-200",
      icon: CheckCircle,
    },
    preparing: {
      label: "Preparing",
      color: "bg-purple-100 text-purple-800 border-purple-200",
      icon: Package,
    },
    ready_for_pickup: {
      label: "Ready for Pickup",
      color: "bg-indigo-100 text-indigo-800 border-indigo-200",
      icon: CheckCircle,
    },
    picked_up: {
      label: "Picked Up",
      color: "bg-orange-100 text-orange-800 border-orange-200",
      icon: Truck,
    },
    out_for_delivery: {
      label: "Out for Delivery",
      color: "bg-blue-100 text-blue-800 border-blue-200",
      icon: Truck,
    },
    completed: {
      label: "Completed",
      color: "bg-green-100 text-green-800 border-green-200",
      icon: CheckCircle,
    },
    cancelled: {
      label: "Cancelled",
      color: "bg-red-100 text-red-800 border-red-200",
      icon: XCircle,
    },
  };

  const config = statusConfig[status] || statusConfig.pending;
  const Icon = config.icon;

  const sizeClasses = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-3 py-1 text-sm",
    lg: "px-4 py-1.5 text-base",
  };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium border ${sizeClasses[size]} ${config.color}`}>
      {showIcon && <Icon className="w-3.5 h-3.5" />}
      {config.label}
    </span>
  );
}