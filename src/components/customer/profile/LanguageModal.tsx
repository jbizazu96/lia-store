"use client";

import {motion} from "framer-motion";
import {X, Check, Clock3} from "lucide-react";

interface LanguageModalProps {
  onClose: () => void;
}

const languages = [
  {code: "en", name: "English", flag: "🇺🇸"},
  {code: "fr", name: "French", flag: "🇫🇷"},
  {code: "sw", name: "Swahili", flag: "🇹🇿"},
];

export function LanguageModal({onClose}: LanguageModalProps) {
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
          <div>
            <h2 className="text-xl font-bold text-gray-800">Languages</h2>
            <p className="mt-1 text-sm font-medium text-orange-600">Coming soon</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition"
            aria-label="Close language selector"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5">
          <div className="mb-4 rounded-2xl bg-orange-50 p-4 text-sm leading-6 text-gray-700">
            LIA is currently available in English. French and Swahili are planned for a future update.
          </div>

          <div className="space-y-1" aria-label="Planned application languages">
            {languages.map((lang) => {
              const isAvailable = lang.code === "en";

              return (
                <div
                  key={lang.code}
                  className="flex w-full items-center justify-between rounded-2xl px-4 py-3"
                >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{lang.flag}</span>
                  <span className="font-medium text-gray-800">{lang.name}</span>
                </div>
                {isAvailable ? (
                  <Check className="w-5 h-5 text-green-600" />
                ) : (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-500">
                    <Clock3 className="h-4 w-4" />
                    Planned
                  </span>
                )}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="mt-5 w-full rounded-full bg-orange-500 px-5 py-3 font-semibold text-white transition hover:bg-orange-600"
          >
            Got it
          </button>
        </div>
      </motion.div>
    </div>
  );
}
