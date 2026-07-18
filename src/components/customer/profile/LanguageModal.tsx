"use client";

import {motion} from "framer-motion";
import {X, Check} from "lucide-react";

interface LanguageModalProps {
  currentLanguage: string;
  onClose: () => void;
  onSelect: (language: string) => void;
}

const languages = [
  {code: "en", name: "English", flag: "🇺🇸"},
  {code: "fr", name: "French", flag: "🇫🇷"},
  {code: "sw", name: "Swahili", flag: "🇹🇿"},
];

export function LanguageModal({currentLanguage, onClose, onSelect}: LanguageModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{opacity: 0, scale: 0.95}}
        animate={{opacity: 1, scale: 1}}
        exit={{opacity: 0, scale: 0.95}}
        className="bg-white rounded-3xl max-w-md w-full max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-800">Select Language</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition"
            aria-label="Close language selector"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Language List */}
        <div className="p-4 space-y-1">
          {languages.map((lang) => {
            const isSelected = lang.name === currentLanguage;
            
            return (
              <button
                key={lang.code}
                onClick={() => {
                  onSelect(lang.name);
                  onClose();
                }}
                className="w-full flex items-center justify-between px-4 py-4 hover:bg-gray-50 rounded-xl transition"
                aria-label={`Select ${lang.name}`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{lang.flag}</span>
                  <span className="font-medium text-gray-800">{lang.name}</span>
                </div>
                {isSelected && (
                  <Check className="w-5 h-5 text-green-600" />
                )}
              </button>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}