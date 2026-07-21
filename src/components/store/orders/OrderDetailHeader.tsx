"use client";

/*
  Order detail header with back button, order ID, and status.
*/

import {
  formatOrderDate,
} from "@/utils/orderDisplay";
import Link from "next/link";
import {ArrowLeft, Printer, Calendar} from "lucide-react";
import {StatusBadge} from "@/components/store/orders/StatusBadge";

interface OrderDetailHeaderProps {
  orderId: string;
  status: string;
  createdAt: string;
}

export function OrderDetailHeader({orderId, status, createdAt}: OrderDetailHeaderProps) {

  return (
    <div className="flex items-center gap-4">
      <Link
        href="/store/store-orders"
        className="p-2 hover:bg-gray-100 rounded-xl transition"
      >
        <ArrowLeft className="w-5 h-5" />
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-gray-800">
          Order #{orderId.slice(0, 8).toUpperCase()}
        </h1>
        <div className="flex items-center gap-3 mt-1">
          <StatusBadge status={status} size="sm" />
          <span className="text-sm text-gray-400">
            <Calendar className="w-3.5 h-3.5 inline mr-1" />
            {formatOrderDate(
              new Date(createdAt)
            )}
          </span>
        </div>
      </div>
      <button className="ml-auto px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition flex items-center gap-2">
        <Printer className="w-4 h-4" />
        Print
      </button>
    </div>
  );
}
