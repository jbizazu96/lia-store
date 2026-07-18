"use client";

/*
  Order statistics bar.
*/

import {motion} from "framer-motion";
import {ShoppingBag, Clock, CheckCircle, XCircle} from "lucide-react";

interface OrderStatsProps {
  total: number;
  pending: number;
  completed: number;
  cancelled: number;
}

export function OrderStats({total, pending, completed, cancelled}: OrderStatsProps) {
  const stats = [
    {
      label: "Total Orders",
      value: total,
      icon: ShoppingBag,
      color: "bg-blue-500",
      bgColor: "bg-blue-50",
      textColor: "text-blue-600",
    },
    {
      label: "Pending",
      value: pending,
      icon: Clock,
      color: "bg-yellow-500",
      bgColor: "bg-yellow-50",
      textColor: "text-yellow-600",
    },
    {
      label: "Completed",
      value: completed,
      icon: CheckCircle,
      color: "bg-green-500",
      bgColor: "bg-green-50",
      textColor: "text-green-600",
    },
    {
      label: "Cancelled",
      value: cancelled,
      icon: XCircle,
      color: "bg-red-500",
      bgColor: "bg-red-50",
      textColor: "text-red-600",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, index) => (
        <motion.div
          key={stat.label}
          initial={{opacity: 0, y: 20}}
          animate={{opacity: 1, y: 0}}
          transition={{delay: index * 0.05}}
          className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-500">{stat.label}</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{stat.value}</p>
            </div>
            <div className={`${stat.bgColor} p-2.5 rounded-xl`}>
              <stat.icon className={`w-5 h-5 ${stat.textColor}`} />
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}