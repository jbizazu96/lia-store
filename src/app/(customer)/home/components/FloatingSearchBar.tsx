"use client";

import {useState} from "react";
import {motion} from "framer-motion";
import {Search, X} from "lucide-react";

interface FloatingSearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export function FloatingSearchBar({value, onChange}: FloatingSearchBarProps) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <motion.div 
      className="fixed bottom-4 left-4 right-4 z-30 max-w-md mx-auto"
      initial={{y: 20, opacity: 0}}
      animate={{y: 0, opacity: 1}}
      transition={{delay: 0.3}}
    >
      <div className={`relative bg-white rounded-2xl shadow-lg border transition ${
        isFocused ? "border-orange-400 ring-2 ring-orange-100" : "border-gray-200"
      }`}>
        <div className="flex items-center px-4 py-3">
          <Search className={`w-5 h-5 flex-shrink-0 ${
            isFocused ? "text-orange-500" : "text-gray-400"
          }`} />
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Search in LIA"
            className={`flex-1 mx-3 bg-transparent text-gray-800 placeholder-gray-400 focus:outline-none text-sm ${
              isFocused ? "text-orange-600" : "text-gray-800"
            }`}
          />
          {value && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="p-1 hover:bg-gray-100 rounded-full transition"
              aria-label="Clear search"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>

        {/* Search suggestions */}
        {isFocused && (
          <motion.div 
            className="border-t border-gray-100 p-4 space-y-2"
            initial={{opacity: 0, height: 0}}
            animate={{opacity: 1, height: "auto"}}
          >
            <p className="text-xs text-gray-400 font-medium">Recent Searches</p>
            <div className="flex flex-wrap gap-2">
              {["Tomatoes", "Rice", "Plantains", "Palm Oil"].map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => onChange(item)}
                  className="px-3 py-1 bg-gray-100 text-gray-600 text-xs rounded-full hover:bg-gray-200 transition"
                >
                  {item}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}