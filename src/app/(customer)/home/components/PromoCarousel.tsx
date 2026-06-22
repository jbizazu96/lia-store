"use client";

import {useState, useEffect} from "react";
import {motion, AnimatePresence} from "framer-motion";
import {ArrowLeft, ArrowRight, Tag, Gift} from "lucide-react";

interface Promo {
  id: number;
  title: string;
  subtitle: string;
  color: string;
  icon: React.ElementType;
}

const promos: Promo[] = [
  {
    id: 1,
    title: "$0 Delivery Fee",
    subtitle: "On your first LIA order",
    color: "from-orange-500 to-orange-600",
    icon: Tag,
  },
  {
    id: 2,
    title: "Summer Special",
    subtitle: "Get 20% off on all African groceries",
    color: "from-green-500 to-green-600",
    icon: Gift,
  },
  {
    id: 3,
    title: "New Store Alert",
    subtitle: "Discover new African stores in your area",
    color: "from-blue-500 to-blue-600",
    icon: Tag,
  },
];

export function PromoCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  useEffect(() => {
    if (isAutoPlaying) {
      const interval = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % promos.length);
      }, 4000);
      return () => clearInterval(interval);
    }
  }, [isAutoPlaying]);

  const handlePrev = () => {
    setIsAutoPlaying(false);
    setCurrentIndex((prev) => (prev - 1 + promos.length) % promos.length);
    setTimeout(() => setIsAutoPlaying(true), 5000);
  };

  const handleNext = () => {
    setIsAutoPlaying(false);
    setCurrentIndex((prev) => (prev + 1) % promos.length);
    setTimeout(() => setIsAutoPlaying(true), 5000);
  };

  const currentPromo = promos[currentIndex];
  const IconComponent = currentPromo.icon;

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{opacity: 0, x: 100}}
          animate={{opacity: 1, x: 0}}
          exit={{opacity: 0, x: -100}}
          transition={{duration: 0.4}}
          className={`bg-gradient-to-r ${currentPromo.color} p-6 rounded-2xl min-h-[120px] flex items-center`}
        >
          <div className="flex items-center gap-4 w-full">
            <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
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
            <button 
              className="px-4 py-2 bg-white/20 text-white text-sm font-semibold rounded-full hover:bg-white/30 transition"
              aria-label="Shop this promotion"
            >
              Shop now
            </button>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Navigation Buttons - FIXED */}
      <button
        onClick={handlePrev}
        aria-label="Previous promotion"
        className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/30 hover:bg-black/50 text-white rounded-full flex items-center justify-center transition"
      >
        <ArrowLeft className="w-4 h-4" />
      </button>
      <button
        onClick={handleNext}
        aria-label="Next promotion"
        className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/30 hover:bg-black/50 text-white rounded-full flex items-center justify-center transition"
      >
        <ArrowRight className="w-4 h-4" />
      </button>

      {/* Dots - FIXED */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
        {promos.map((_, index) => (
          <button
            key={index}
            onClick={() => {
              setIsAutoPlaying(false);
              setCurrentIndex(index);
              setTimeout(() => setIsAutoPlaying(true), 5000);
            }}
            aria-label={`Go to promotion ${index + 1}`}
            className={`w-2 h-2 rounded-full transition ${
              index === currentIndex ? "bg-white w-4" : "bg-white/50"
            }`}
          />
        ))}
      </div>
    </div>
  );
}