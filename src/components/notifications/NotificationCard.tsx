"use client";

/*
|--------------------------------------------------------------------------
| Notification Card
|--------------------------------------------------------------------------
|
| Displays a single notification with clean modern design.
|
*/

import { formatRelativeTime } from "@/utils/formatRelativeTime";
import {
  Bell,
  CheckCircle,
  Package,
  ShoppingBag,
  Truck,
  XCircle,
  Clock,
  ChevronRight,
} from "lucide-react";

import type {
  Notification,
} from "@/services/notification/notificationTypes";

interface NotificationCardProps {
  notification: Notification;
  onClick?: () => void;
}

const ICONS = {
  bell: Bell,
  "shopping-bag": ShoppingBag,
  package: Package,
  "package-check": Package,
  truck: Truck,
  "check-circle": CheckCircle,
  "x-circle": XCircle,
  clock: Clock,
};

const COLORS = {
  gray: "bg-gray-100 text-gray-600 border-gray-200",
  orange: "bg-orange-100 text-orange-600 border-orange-200",
  purple: "bg-purple-100 text-purple-600 border-purple-200",
  indigo: "bg-indigo-100 text-indigo-600 border-indigo-200",
  blue: "bg-blue-100 text-blue-600 border-blue-200",
  green: "bg-green-100 text-green-600 border-green-200",
  red: "bg-red-100 text-red-600 border-red-200",
};

// ✅ Map notification types to colors
const getColorForType = (type: string): keyof typeof COLORS => {
  switch (type) {
    case "order_accepted":
    case "order_delivered":
      return "green";
    case "order_preparing":
      return "purple";
    case "order_ready":
      return "indigo";
    case "order_out_for_delivery":
      return "blue";
    case "order_cancelled":
      return "red";
    case "inventory":
      return "orange";
    default:
      return "gray";
  }
};

// ✅ Map notification types to icons
const getIconForType = (type: string): keyof typeof ICONS => {
  switch (type) {
    case "order_accepted":
      return "check-circle";
    case "order_preparing":
      return "package";
    case "order_ready":
      return "clock";
    case "order_out_for_delivery":
      return "truck";
    case "order_delivered":
      return "check-circle";
    case "order_cancelled":
      return "x-circle";
    case "inventory":
      return "package";
    default:
      return "bell";
  }
};

export function NotificationCard({
  notification,
  onClick,
}: NotificationCardProps) {
  // ✅ Determine icon and color based on notification type
  const iconKey = getIconForType(notification.type);
  const colorKey = getColorForType(notification.type);
  
  const Icon = ICONS[iconKey] ?? Bell;
  const color = COLORS[colorKey] ?? COLORS.gray;

  // ✅ Check if notification is read
  const isRead = notification.read ?? false;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-2xl border transition-all hover:shadow-md ${
        isRead
          ? "bg-white border-gray-100 hover:bg-gray-50"
          : "bg-orange-50/80 border-orange-200 hover:border-orange-300"
      }`}
    >
      <div className="flex gap-4">
        {/* Icon */}
        <div
          className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${color}`}
        >
          <Icon className="w-6 h-6" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className={`font-semibold text-sm ${
              isRead ? "text-gray-700" : "text-gray-900"
            }`}>
              {notification.title}
            </h3>
            {!isRead && (
              <span className="w-2 h-2 bg-orange-500 rounded-full flex-shrink-0 mt-1.5" />
            )}
          </div>

          <p className={`text-sm mt-1 ${
            isRead ? "text-gray-500" : "text-gray-600"
          }`}>
            {notification.body}
          </p>

          <div className="flex items-center gap-2 mt-2">
            <p className="text-xs text-gray-400">
              {formatRelativeTime(notification.createdAt)}
            </p>
            <span className="text-xs text-gray-300">•</span>
            <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
          </div>
        </div>
      </div>
    </button>
  );
}
