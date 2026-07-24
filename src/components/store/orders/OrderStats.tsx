"use client";

/*
  Order statistics bar.
*/

import {motion} from "framer-motion";
import {
  ShoppingBag,
  Clock,
  CheckCircle,
  CheckCircle2,
  ChefHat,
  PackageCheck,
  XCircle,
} from "lucide-react";

interface OrderStatsProps {
  total: number;
  pending: number;
  accepted: number;
  preparing: number;
  readyForPickup: number;
  completed: number;
  cancelled: number;
}

export function OrderStats({
  total,
  pending,
  accepted,
  preparing,
  readyForPickup,
  completed,
  cancelled,
}: OrderStatsProps) {
  const stats = [
    {
      label: "Total",
      value: total,
      icon: ShoppingBag,
      bgColor: "bg-blue-50",
      textColor: "text-blue-600",
    },
    {
      label: "Pending",
      value: pending,
      icon: Clock,
      bgColor: "bg-yellow-50",
      textColor: "text-yellow-600",
    },
    {
      label: "Accepted",
      value: accepted,
      icon: CheckCircle2,
      bgColor: "bg-sky-50",
      textColor: "text-sky-600",
    },
    {
      label: "Preparing",
      value: preparing,
      icon: ChefHat,
      bgColor: "bg-violet-50",
      textColor: "text-violet-600",
    },
    {
      label: "Ready",
      value: readyForPickup,
      icon: PackageCheck,
      bgColor: "bg-orange-50",
      textColor: "text-orange-600",
    },
    {
      label: "Completed",
      value: completed,
      icon: CheckCircle,
      bgColor: "bg-green-50",
      textColor: "text-green-600",
    },
    {
      label: "Cancelled",
      value: cancelled,
      icon: XCircle,
      bgColor: "bg-red-50",
      textColor: "text-red-600",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
      {stats.map((stat, index) => (
        <motion.div
          key={stat.label}
          initial={{opacity: 0, y: 20}}
          animate={{opacity: 1, y: 0}}
          transition={{delay: index * 0.05}}
          className="rounded-xl border border-gray-100 bg-white p-2.5 shadow-sm"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] leading-tight text-gray-500">{stat.label}</p>
              <p className="mt-0.5 text-lg font-bold text-gray-800">{stat.value}</p>
            </div>
            <div className={`${stat.bgColor} rounded-lg p-1.5`}>
              <stat.icon className={`h-3.5 w-3.5 ${stat.textColor}`} />
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
