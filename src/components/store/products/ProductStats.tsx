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
  outOfStockProducts: number;
  imageIssueProducts: number;
}

export function ProductStats({
  totalProducts,
  activeProducts,
  featuredProducts,
  totalValue,
  totalStock,
  outOfStockProducts,
  imageIssueProducts,
}: ProductStatsProps) {
  const inventoryValue = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(totalValue);

  const stats = [
    {
      label: "Total Products",
      value: totalProducts,
      icon: Package,
      bgColor: "bg-blue-50",
      textColor: "text-blue-600",
    },
    {
      label: "Enabled",
      value: activeProducts,
      icon: Tag,
      bgColor: "bg-green-50",
      textColor: "text-green-600",
    },
    {
      label: "Featured",
      value: featuredProducts,
      icon: TrendingUp,
      bgColor: "bg-orange-50",
      textColor: "text-orange-600",
    },
    {
      label: "Total Stock",
      value: totalStock,
      icon: ShoppingBag,
      bgColor: "bg-purple-50",
      textColor: "text-purple-600",
    },
    {
      label: "Retail Inventory Value",
      value: inventoryValue,
      icon: DollarSign,
      bgColor: "bg-indigo-50",
      textColor: "text-indigo-600",
    },
    {label: "Out of Stock", value: outOfStockProducts, icon: Package, bgColor: "bg-red-50", textColor: "text-red-600"},
    {label: "Image Issues", value: imageIssueProducts, icon: Package, bgColor: "bg-amber-50", textColor: "text-amber-600"},
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
      {stats.map((stat, index) => (
        <motion.div
          key={stat.label}
          initial={{opacity: 0, y: 20}}
          animate={{opacity: 1, y: 0}}
          transition={{delay: index * 0.05}}
          className="min-w-0 overflow-hidden rounded-xl border border-gray-100 bg-white p-2.5 shadow-sm"
        >
          <div className="flex min-w-0 items-start justify-between gap-1.5">
            <div className="min-w-0">
              <p className="text-[11px] leading-tight text-gray-500">{stat.label}</p>
              <p className="mt-0.5 truncate text-lg font-bold tabular-nums text-gray-800" title={String(stat.value)}>{stat.value}</p>
            </div>
            <div className={`${stat.bgColor} shrink-0 rounded-lg p-1.5`}>
              <stat.icon className={`h-3.5 w-3.5 ${stat.textColor}`} />
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
