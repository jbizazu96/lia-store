"use client";

/*
  Quick stats bar showing product metrics.
*/

import {motion} from "framer-motion";
import {Package, DollarSign, Tag, TrendingUp, ShoppingBag} from "lucide-react";

interface ProductStatsProps {
  totalProducts: number;
  activeProducts: number;
  featuredProducts: number;
  totalValue: number;
  totalStock: number;
}

export function ProductStats({
  totalProducts,
  activeProducts,
  featuredProducts,
  totalValue,
  totalStock,
}: ProductStatsProps) {
  const stats = [
    {
      label: "Total Products",
      value: totalProducts,
      icon: Package,
      color: "bg-blue-500",
      bgColor: "bg-blue-50",
      textColor: "text-blue-600",
    },
    {
      label: "Active",
      value: activeProducts,
      icon: Tag,
      color: "bg-green-500",
      bgColor: "bg-green-50",
      textColor: "text-green-600",
    },
    {
      label: "Featured",
      value: featuredProducts,
      icon: TrendingUp,
      color: "bg-orange-500",
      bgColor: "bg-orange-50",
      textColor: "text-orange-600",
    },
    {
      label: "Total Stock",
      value: totalStock,
      icon: ShoppingBag,
      color: "bg-purple-500",
      bgColor: "bg-purple-50",
      textColor: "text-purple-600",
    },
    {
      label: "Inventory Value",
      value: `$${totalValue.toFixed(2)}`,
      icon: DollarSign,
      color: "bg-indigo-500",
      bgColor: "bg-indigo-50",
      textColor: "text-indigo-600",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {stats.map((stat, index) => (
        <motion.div
          key={stat.label}
          initial={{opacity: 0, y: 20}}
          animate={{opacity: 1, y: 0}}
          transition={{delay: index * 0.05}}
          className="bg-white rounded-xl p-3 shadow-sm border border-gray-100"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-500">{stat.label}</p>
              <p className="text-lg font-bold text-gray-800 mt-0.5">{stat.value}</p>
            </div>
            <div className={`${stat.bgColor} p-1.5 rounded-lg`}>
              <stat.icon className={`w-3.5 h-3.5 ${stat.textColor}`} />
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}