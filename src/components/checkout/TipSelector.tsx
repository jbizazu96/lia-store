"use client";

/*
  Tip selector for drivers - DoorDash style.
*/

import {useState} from "react";
import {motion, AnimatePresence} from "framer-motion";
import {DollarSign, Plus} from "lucide-react";

interface TipSelectorProps {
  selectedTip: number;
  onTipChange: (amount: number) => void;
}

const TIP_OPTIONS = [2.5, 3, 4];

export function TipSelector({selectedTip, onTipChange}: TipSelectorProps) {
  const [showCustomTip, setShowCustomTip] = useState(false);
  const [customTip, setCustomTip] = useState("");

  const handleCustomTip = () => {
    const amount = parseFloat(customTip);
    if (!isNaN(amount) && amount > 0) {
      onTipChange(amount);
      setShowCustomTip(false);
      setCustomTip("");
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-transparent p-5">
      <p className="mb-4 text-xs text-gray-500">
        100% of the tip goes to your driver. Show appreciation for great service!
      </p>

      {/* Tip Options */}
      <div className="flex gap-3">
        {TIP_OPTIONS.map((amount) => (
          <button
            key={amount}
            onClick={() => {
              onTipChange(amount);
              setShowCustomTip(false);
            }}
            className={`flex-1 rounded-full border px-2 py-3 font-medium transition ${
              selectedTip === amount
                ? "border-orange-500 bg-orange-500 text-white"
                : "border-transparent bg-gray-100 text-gray-700 hover:border-orange-200 hover:bg-orange-50"
            }`}
          >
            ${amount}
          </button>
        ))}
        <button
          onClick={() => {
            setShowCustomTip(!showCustomTip);
            if (!showCustomTip) onTipChange(0);
          }}
          className={`flex-1 rounded-full border px-2 py-3 font-medium transition ${
            showCustomTip
              ? "border-orange-500 bg-orange-500 text-white"
              : "border-transparent bg-gray-100 text-gray-700 hover:border-orange-200 hover:bg-orange-50"
          }`}
        >
          <Plus className="w-4 h-4 mx-auto" />
        </button>
      </div>

      {/* Custom Tip Input */}
      <AnimatePresence>
        {showCustomTip && (
          <motion.div
            initial={{opacity: 0, height: 0}}
            animate={{opacity: 1, height: "auto"}}
            exit={{opacity: 0, height: 0}}
            className="mt-4 pt-4 border-t border-gray-100 space-y-3"
          >
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  placeholder="Enter amount"
                  value={customTip}
                  onChange={(e) => setCustomTip(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <button
                onClick={handleCustomTip}
                className="px-6 py-2.5 bg-orange-500 text-white rounded-xl font-medium hover:bg-orange-600 transition"
              >
                Apply
              </button>
            </div>
            <p className="text-xs text-gray-400">
              💡 Tip amount will be added to your total
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {selectedTip > 0 && !showCustomTip && (
        <p className="text-xs text-green-600 mt-3">
          ✅ ${selectedTip.toFixed(2)} tip added
        </p>
      )}
    </div>
  );
}
