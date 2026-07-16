"use client";

/*
  Branded loading screen with LIA logo animation.
  Consistent loading experience across all pages.
*/

import {motion} from "framer-motion";

interface BrandedLoaderProps {
  message?: string;
}

export function BrandedLoader({message = "Loading..."}: BrandedLoaderProps) {
  return (
    <div className="min-h-screen bg-white flex flex-col justify-center items-center relative overflow-hidden">
      {/* Ambient Glows */}
      <div className="absolute top-0 right-0 h-[500px] w-[500px] rounded-full bg-orange-400/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 h-[400px] w-[400px] rounded-full bg-blue-500/5 blur-[100px] pointer-events-none" />

      {/* Centered Loader */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col items-center justify-center p-8 relative z-10"
      >
        {/* Logo Orbiting Container */}
        <div className="relative w-28 h-28 mb-8 flex items-center justify-center">
          
          {/* Dotted Orbit Ring */}
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0 rounded-full border-2 border-dashed border-orange-400/30"
          />
          
          {/* Inner Ring */}
          <motion.div 
            animate={{ rotate: -360 }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
            className="absolute inset-2 rounded-full border border-orange-400/10"
          />
          
          {/* Rotating glowing dots */}
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0"
          >
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-orange-400 shadow-[0_0_15px_rgba(251,146,60,0.8)]" />
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-2 h-2 rounded-full bg-orange-400/40" />
            <div className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-orange-400/40" />
            <div className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-orange-400/40" />
          </motion.div>

          {/* Central Logo Image */}
          <div className="relative w-16 h-16 z-10 bg-white/80 backdrop-blur-md rounded-full border-2 border-orange-400/50 shadow-[0_0_30px_rgba(251,146,60,0.15)] flex items-center justify-center overflow-hidden">
            <img 
              src="/icon/icon-192.png" 
              alt="LIA Logo" 
              className="w-12 h-12 object-contain" 
            />
          </div>
        </div>

        {/* Loading Text */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="text-center"
        >
          <h3 className="text-lg font-medium text-gray-600 mb-1 tracking-wide opacity-100">
            {message}
          </h3>
          <div className="flex items-center justify-center gap-1 mt-2">
            <motion.span 
              initial={{ opacity: 0.5 }} 
              animate={{ opacity: [0.5, 1, 0.5] }} 
              transition={{ duration: 1.5, repeat: Infinity, delay: 0 }} 
              className="w-1.5 h-1.5 rounded-full bg-orange-400"
            />
            <motion.span 
              initial={{ opacity: 0.5 }} 
              animate={{ opacity: [0.5, 1, 0.5] }} 
              transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }} 
              className="w-1.5 h-1.5 rounded-full bg-orange-400"
            />
            <motion.span 
              initial={{ opacity: 0.5 }} 
              animate={{ opacity: [0.5, 1, 0.5] }} 
              transition={{ duration: 1.5, repeat: Infinity, delay: 0.6 }} 
              className="w-1.5 h-1.5 rounded-full bg-orange-400"
            />
          </div>
        </motion.div>
        
      </motion.div>
    </div>
  );
}