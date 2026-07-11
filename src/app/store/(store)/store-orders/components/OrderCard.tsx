"use client";

/*
  Individual order card for the store orders list.
*/

import {motion} from "framer-motion";
import Link from "next/link";
import {Eye, MapPin, User, Clock, DollarSign, Package} from "lucide-react";
import {StatusBadge} from "./StatusBadge";

interface OrderCardProps {
  order: {
    id: string;
    customerName: string;
    customerPhone: string;
    customerAddress: string;
    total: number;
    status: string;
    items: any[];
    createdAt: string;
  };
  index: number;
}

export function OrderCard({order, index}: OrderCardProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    }).format(date);
  };

  return (
    <motion.div
      initial={{opacity: 0, y: 20}}
      animate={{opacity: 1, y: 0}}
      transition={{delay: index * 0.03}}
      className="bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition border border-gray-100"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Order Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <span className="font-mono text-sm font-bold text-gray-600">
              #{order.id.slice(0, 8).toUpperCase()}
            </span>
            <StatusBadge status={order.status} size="sm" />
            <span className="text-sm text-gray-400">
              {formatDate(order.createdAt)}
            </span>
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-1.5 text-gray-600">
              <User className="w-4 h-4" />
              {order.customerName}
            </div>
            <div className="flex items-center gap-1.5 text-gray-600">
              <Package className="w-4 h-4" />
              {order.items.length} items
            </div>
            <div className="flex items-center gap-1.5 text-gray-600">
              <MapPin className="w-4 h-4" />
              {order.customerAddress || "Address not set"}
            </div>
            <div className="flex items-center gap-1.5 text-gray-600">
              <DollarSign className="w-4 h-4" />
              ${order.total.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Link
            href={`/store/orders/${order.id}`}
            className="px-4 py-2 bg-orange-50 text-orange-600 text-sm font-medium rounded-xl hover:bg-orange-100 transition flex items-center gap-2"
          >
            <Eye className="w-4 h-4" />
            View Details
          </Link>
        </div>
      </div>
    </motion.div>
  );
}