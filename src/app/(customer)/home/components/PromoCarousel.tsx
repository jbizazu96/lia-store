"use client";

import {useState, useEffect, useRef} from "react";
import {motion, AnimatePresence} from "framer-motion";
import {Tag, Gift, Truck, Percent} from "lucide-react";

const promos = [
  {
    id: 1,
    title: "Free Delivery",
    subtitle: "On your first order over $20",
    color: "from-orange-500 to-orange-600",
    icon: Truck,
  },
  {
    id: 2,
    title: "Summer Special",
    subtitle: "Get 20% off on all African groceries",
    color: "from-green-500 to-green-600",
    icon: Percent,
  },
  {
    id: 3,
    title: "New Store Alert",
    subtitle: "Discover new African stores in your area",
    color: "from-blue-500 to-blue-600",
    icon: Gift,
  },
  {
    id: 4,
    title: "Refer a Friend",
    subtitle: "Get $10 credit for each referral",
    color: "from-purple-500 to-purple-600",
    icon: Tag,
  },
];

export function PromoCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [offset, setOffset] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-play
  useEffect(() => {
    if (isDragging) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % promos.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [isDragging]);

  // Touch handlers for swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    setStartX(e.touches[0].clientX);
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const delta = e.touches[0].clientX - startX;
    setOffset(delta);
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    
    const threshold = 50;
    if (offset > threshold) {
      setCurrentIndex((prev) => (prev - 1 + promos.length) % promos.length);
    } else if (offset < -threshold) {
      setCurrentIndex((prev) => (prev + 1) % promos.length);
    }
    setOffset(0);
  };

  const handleDotClick = (index: number) => {
    setCurrentIndex(index);
  };

  // ✅ Get the current promo
  const currentPromo = promos[currentIndex];
  const IconComponent = currentPromo.icon;

  return (
    <div 
      ref={containerRef}
      className="relative overflow-hidden rounded-2xl touch-pan-y"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{opacity: 0, x: 100}}
          animate={{opacity: 1, x: offset}}
          exit={{opacity: 0, x: -100}}
          transition={{duration: 0.4}}
          className={`bg-gradient-to-r ${currentPromo.color} p-6 rounded-2xl min-h-[120px] flex items-center`}
        >
          <div className="flex items-center gap-4 w-full">
            <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
              {/* ✅ Use IconComponent correctly */}
              <IconComponent className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-white font-bold text-lg">
                {currentPromo.title}
              </h3>
              <p className="text-white/90 text-sm">
                {currentPromo.subtitle}
              </p>
            </div>
            <button className="px-4 py-2 bg-white/20 text-white text-sm font-semibold rounded-full hover:bg-white/30 transition">
              Shop now
            </button>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Dots */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
        {promos.map((_, index) => (
          <button
            key={index}
            onClick={() => handleDotClick(index)}
            className={`w-2 h-2 rounded-full transition ${
              index === currentIndex ? "bg-white w-4" : "bg-white/50"
            }`}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}