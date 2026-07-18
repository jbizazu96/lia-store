"use client";

/*
  Promotion banner component.
  Shows store promotions and offers.
*/

import {motion} from "framer-motion";
import {Gift, Tag, Truck, Percent} from "lucide-react";
import {Promotion} from "@/app/(customer)/store/[storeId]/types";

interface PromoBannerProps {
  promotions: Promotion[];
}

export function PromoBanner({promotions}: PromoBannerProps) {
  if (!promotions || promotions.length === 0) return null;

  // Get promotion icon
  const getPromoIcon = (type: string) => {
    switch (type) {
      case "discount":
        return <Percent className="w-4 h-4" />;
      case "bogo":
        return <Gift className="w-4 h-4" />;
      case "free_shipping":
        return <Truck className="w-4 h-4" />;
      default:
        return <Tag className="w-4 h-4" />;
    }
  };

  // Get promotion color
  const getPromoColor = (type: string) => {
    switch (type) {
      case "discount":
        return "bg-red-500";
      case "bogo":
        return "bg-purple-500";
      case "free_shipping":
        return "bg-blue-500";
      default:
        return "bg-orange-500";
    }
  };

  return (
    <div className="space-y-2">
      {promotions.map((promo, index) => (
        <motion.div
          key={promo.id}
          initial={{opacity: 0, x: -20}}
          animate={{opacity: 1, x: 0}}
          transition={{delay: index * 0.1}}
          className={`${getPromoColor(promo.type)} rounded-xl p-3 text-white flex items-center gap-3 shadow-md`}
        >
          <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
            {getPromoIcon(promo.type)}
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm">{promo.title}</p>
            <p className="text-white/90 text-xs">{promo.description}</p>
          </div>
          <div className="text-xs font-medium bg-white/20 px-3 py-1 rounded-full">
            Claim
          </div>
        </motion.div>
      ))}
    </div>
  );
}
