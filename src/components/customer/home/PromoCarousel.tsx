"use client";

import {useEffect, useRef, useState} from "react";
import {useRouter} from "next/navigation";
import {motion, AnimatePresence} from "framer-motion";
import {Gift, Percent, Tag, Truck} from "lucide-react";
import {homePromotionClientService} from "@/services/promotion/homePromotionClientService";
import type {HomePromotion} from "@/types/homePromotion";

const THEME = {
  orange: {color: "from-orange-500 to-orange-600", icon: Truck},
  green: {color: "from-green-500 to-green-600", icon: Percent},
  blue: {color: "from-blue-500 to-blue-600", icon: Gift},
  purple: {color: "from-purple-500 to-purple-600", icon: Tag},
} as const;

export function PromoCarousel() {
  const router = useRouter();
  const [promotions, setPromotions] = useState<HomePromotion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [offset, setOffset] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const result = await homePromotionClientService.getActive();
        if (active) {
          setPromotions(result);
          setCurrentIndex((current) => Math.min(current, Math.max(result.length - 1, 0)));
        }
      } catch {
        if (active) setPromotions([]);
      }
    };
    void load();
    const interval = window.setInterval(() => { void load(); }, 60_000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    if (isDragging || promotions.length < 2) return;
    const interval = window.setInterval(() => {
      setCurrentIndex((current) => (current + 1) % promotions.length);
    }, 5_000);
    return () => window.clearInterval(interval);
  }, [isDragging, promotions.length]);

  if (promotions.length === 0) return null;
  const currentPromotion = promotions[currentIndex];
  const theme = THEME[currentPromotion.theme];
  const Icon = theme.icon;

  const finishSwipe = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (offset > 50) setCurrentIndex((current) => (current - 1 + promotions.length) % promotions.length);
    if (offset < -50) setCurrentIndex((current) => (current + 1) % promotions.length);
    setOffset(0);
  };

  return <div ref={containerRef} className="relative overflow-hidden rounded-2xl touch-pan-y" onTouchStart={(event) => { setStartX(event.touches[0].clientX); setIsDragging(true); }} onTouchMove={(event) => { if (isDragging) setOffset(event.touches[0].clientX - startX); }} onTouchEnd={finishSwipe}>
    <AnimatePresence mode="wait"><motion.div key={currentPromotion.id} initial={{opacity: 0, x: 100}} animate={{opacity: 1, x: offset}} exit={{opacity: 0, x: -100}} transition={{duration: 0.4}} className={`flex min-h-[120px] items-center rounded-2xl bg-gradient-to-r p-6 ${theme.color}`}>
      <div className="flex w-full items-center gap-4"><div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/20"><Icon className="h-7 w-7 text-white"/></div><div className="flex-1"><h3 className="text-lg font-bold text-white">{currentPromotion.title}</h3><p className="text-sm text-white/90">{currentPromotion.subtitle}</p></div>{currentPromotion.targetPath && <button type="button" onClick={() => router.push(currentPromotion.targetPath!)} className="rounded-full bg-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/30">{currentPromotion.ctaLabel}</button>}</div>
    </motion.div></AnimatePresence>
    {promotions.length > 1 && <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">{promotions.map((promotion, index) => <button key={promotion.id} type="button" onClick={() => setCurrentIndex(index)} className={`h-2 rounded-full transition ${index === currentIndex ? "w-4 bg-white" : "w-2 bg-white/50"}`} aria-label={`Go to slide ${index + 1}`}/>)}</div>}
  </div>;
}
