"use client";

import {motion} from "framer-motion";
import {User} from "lucide-react";

interface ProfileHeaderProps {
  displayName: string;
  email: string;
}

export function ProfileHeader({displayName, email}: ProfileHeaderProps) {
  return (
    <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-6">
      <motion.div 
        initial={{opacity: 0, y: -20}}
        animate={{opacity: 1, y: 0}}
        className="max-w-lg mx-auto"
      >
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center border-2 border-white/50">
            <User className="w-10 h-10 text-white" />
          </div>
          
          <div>
            <h1 className="text-2xl font-bold text-white">
              {displayName}
            </h1>
            <p className="text-white/80 text-sm">
              {email}
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}