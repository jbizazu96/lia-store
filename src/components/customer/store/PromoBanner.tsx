"use client";

/*
|--------------------------------------------------------------------------
| Store Promotion Carousel
|--------------------------------------------------------------------------
|
| Displays active product promotions for one store. The visual treatment is
| intentionally code-native (gradients, pattern shapes, and icons), so every
| promotion looks like a campaign banner without requiring another image
| upload from the store owner.
|
*/

import {
  useEffect,
  useState,
} from "react";
import {
  AnimatePresence,
  motion,
} from "framer-motion";
import {
  CalendarDays,
  Gift,
  Percent,
  Tag,
  Truck,
} from "lucide-react";

import { promotionService } from "@/services/promotion/promotionService";
import type { Promotion } from "@/types/promotion";

interface PromoBannerProps {
  promotions: Promotion[];
}

const promoThemes = {
  discount: {
    gradient: "from-rose-500 via-red-500 to-orange-500",
    accent: "bg-rose-300/35",
    icon: Percent,
  },
  bogo: {
    gradient: "from-violet-600 via-purple-600 to-fuchsia-600",
    accent: "bg-fuchsia-300/35",
    icon: Gift,
  },
  free_shipping: {
    gradient: "from-sky-500 via-blue-600 to-indigo-600",
    accent: "bg-cyan-300/35",
    icon: Truck,
  },
} as const;

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function getScheduleLabel(promotion: Promotion): string | null {
  const startsAt = formatDate(promotion.startsAt);
  const endsAt = formatDate(promotion.endsAt);

  if (startsAt && endsAt) return `${startsAt} – ${endsAt}`;
  if (endsAt) return `Ends ${endsAt}`;
  if (startsAt) return `Started ${startsAt}`;

  return null;
}

export function PromoBanner({ promotions }: PromoBannerProps) {
  const activePromotions = promotions.filter((promotion) =>
    promotionService.isActive(promotion)
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  useEffect(() => {
    if (activePromotions.length < 2) {
      setCurrentIndex(0);
      return;
    }

    const interval = window.setInterval(() => {
      setCurrentIndex((index) => (index + 1) % activePromotions.length);
    }, 5000);

    return () => window.clearInterval(interval);
  }, [activePromotions.length]);

  if (activePromotions.length === 0) {
    return null;
  }

  const promotion = activePromotions[currentIndex] ?? activePromotions[0];
  const theme = promoThemes[promotion.type];
  const Icon = theme.icon;
  const label = promotionService.getLabel(promotion);
  const scheduleLabel = getScheduleLabel(promotion);

  const changePromotion = (direction: -1 | 1) => {
    if (activePromotions.length < 2) return;

    setCurrentIndex(
      (index) =>
        (index + direction + activePromotions.length) % activePromotions.length
    );
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartX === null || activePromotions.length < 2) return;

    const difference = event.changedTouches[0].clientX - touchStartX;
    setTouchStartX(null);

    if (Math.abs(difference) >= 40) {
      changePromotion(difference > 0 ? -1 : 1);
    }
  };

  return (
    <div
      className="relative overflow-hidden rounded-2xl touch-pan-y"
      onTouchStart={(event) => setTouchStartX(event.touches[0].clientX)}
      onTouchEnd={handleTouchEnd}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={promotion.id}
          initial={{ opacity: 0, x: 48 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -48 }}
          transition={{ duration: 0.28 }}
          className={`relative min-h-[104px] overflow-hidden bg-gradient-to-r ${theme.gradient} px-4 py-4 text-white shadow-md sm:px-5`}
        >
          <div className={`absolute -right-7 -top-10 h-32 w-32 rounded-full ${theme.accent}`} />
          <div className={`absolute -bottom-14 right-20 h-28 w-28 rounded-full ${theme.accent}`} />
          <Tag className="absolute right-5 top-5 h-16 w-16 rotate-12 text-white/10" />

          <div className="relative flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/20 shadow-sm backdrop-blur-sm">
              <Icon className="h-5 w-5" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-white/75">
                {label || "Store special"}
              </p>
              <h3 className="truncate text-lg font-extrabold leading-tight">
                {promotion.title}
              </h3>
              <p className="mt-0.5 line-clamp-1 text-sm text-white/90">
                {promotion.description}
              </p>

              {scheduleLabel && (
                <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-black/15 px-2 py-1 text-[11px] font-semibold text-white/95">
                  <CalendarDays className="h-3 w-3" />
                  {scheduleLabel}
                </p>
              )}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {activePromotions.length > 1 && (
        <div className="absolute bottom-2.5 left-1/2 flex -translate-x-1/2 gap-1.5">
          {activePromotions.map((activePromotion, index) => (
            <button
              key={activePromotion.id}
              type="button"
              onClick={() => setCurrentIndex(index)}
              className={`h-1.5 rounded-full transition-all ${
                index === currentIndex ? "w-4 bg-white" : "w-1.5 bg-white/45"
              }`}
              aria-label={`Show promotion ${index + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
