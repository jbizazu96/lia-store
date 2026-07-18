"use client";

import {Clipboard} from "lucide-react";

interface DeliveryInstructionsProps {
  value: string;
  onChange: (value: string) => void;
}

export function DeliveryInstructions({value, onChange}: DeliveryInstructionsProps) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center gap-2 mb-3">
        <Clipboard className="w-5 h-5 text-orange-500" />
        <h3 className="font-semibold text-gray-800">Delivery Instructions</h3>
        <span className="text-xs text-gray-400 ml-auto">Optional</span>
      </div>

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g., Leave at front door, call upon arrival, gate code: 1234..."
        rows={3}
        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm placeholder-gray-400 resize-none"
      />
      <p className="text-xs text-gray-400 mt-1.5">
        Instructions will be shared with the driver
      </p>
    </div>
  );
}