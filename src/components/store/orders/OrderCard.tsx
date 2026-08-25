"use client";

/*
|--------------------------------------------------------------------------
| Store Order Card
|--------------------------------------------------------------------------
|
| Displays a summary of one customer order.
|
| The Order has already been mapped into the application's
| domain model, so this component only displays data.
|
*/

import {
  formatOrderCurrency,
  formatOrderDate,
  displayOrderNumber,
} from "@/utils/orderDisplay";
import type { Order } from "@/types/order";
import {motion} from "framer-motion";
import Link from "next/link";
import {Eye, MapPin, User, DollarSign, Package} from "lucide-react";
import {StatusBadge} from "./StatusBadge";
import {OrderInvestigationNotice} from "./OrderInvestigationNotice";

interface OrderCardProps {
  order: Order;
  index: number;
  hideFinancials?: boolean;
}

export function OrderCard({order, index, hideFinancials = false}: OrderCardProps) {
  const grossStoreAmount = order.storeFinancials?.grossStoreAmount ??
    order.pricing.subtotal + order.pricing.tax;
  const unitCount = order.items.reduce((total, item) => total + Math.max(0, item.quantity || 0), 0);
  const financialAmount = order.storeFinancials?.netStoreEarning ?? grossStoreAmount;
  const financialLabel = order.storeFinancials?.netStoreEarning === null || order.storeFinancials?.netStoreEarning === undefined
    ? "Gross store amount"
    : "Net store earning";

  return (
    <Link
      href={`/store/store-orders/${order.id}`}
      className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
      aria-label={`View details for order ${displayOrderNumber(order.orderNumber)}`}
    >
      <motion.div
        initial={{opacity: 0, y: 20}}
        animate={{opacity: 1, y: 0}}
        transition={{delay: index * 0.03}}
        className="cursor-pointer rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
      >
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        {/* Order Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <span className="font-mono text-sm font-bold text-gray-600">
              {displayOrderNumber(order.orderNumber)}
            </span>
            <StatusBadge status={order.status} size="sm" />
            <OrderInvestigationNotice
              investigation={order.liaInvestigation}
              compact
            />
            <span className="text-sm text-gray-400">
              {formatOrderDate(order.payment?.paidAt ?? order.createdAt)}
            </span>
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-1.5 text-gray-600">
              <User className="w-4 h-4" />
              {order.customer.name}
            </div>
            <div className="flex items-center gap-1.5 text-gray-600">
              <Package className="w-4 h-4" />
              {order.items.length} product{order.items.length === 1 ? "" : "s"} · {unitCount} unit{unitCount === 1 ? "" : "s"}
            </div>
            <div className="flex items-center gap-1.5 text-gray-600">
              <MapPin className="w-4 h-4" />
              {order.customer.address || "Address not set"}
            </div>
            {/* ✅ Show calculated store total */}
            {!hideFinancials && <div className="flex items-center gap-1.5 text-green-600 font-medium">
              <DollarSign className="w-4 h-4" />
              <span title={financialLabel}>{formatOrderCurrency(financialAmount)}</span>
            </div>}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <span
            className="px-4 py-2 bg-orange-50 text-orange-600 text-sm font-medium rounded-xl hover:bg-orange-100 transition flex items-center gap-2"
          >
            <Eye className="w-4 h-4" />
            View Details
          </span>
        </div>
      </div>
      </motion.div>
    </Link>
  );
}
