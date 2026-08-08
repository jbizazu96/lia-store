"use client";

import {Clipboard} from "lucide-react";

interface DeliveryInstructionsProps {
  value: string;
  onChange: (value: string) => void;
}

export function DeliveryInstructions({value, onChange}: DeliveryInstructionsProps) {
  return (
    <section className="rounded-[26px] border border-gray-200 bg-white p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600">
          <Clipboard className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-extrabold text-gray-900">Delivery Instructions</h3>
          <p className="mt-0.5 text-xs text-gray-500">Help your driver find you easily.</p>
        </div>
        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500">Optional</span>
      </div>

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g., Leave at front door, call upon arrival, gate code: 1234..."
        rows={3}
        className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800 placeholder-gray-400 resize-none focus:border-orange-400 focus:ring-2 focus:ring-orange-200"
      />
      <p className="mt-2 text-xs text-gray-400">
        Instructions will be shared with the driver
      </p>
    </section>
  );
}
