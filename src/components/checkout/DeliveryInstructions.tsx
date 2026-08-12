"use client";

interface DeliveryInstructionsProps {
  value: string;
  onChange: (value: string) => void;
}

export function DeliveryInstructions({value, onChange}: DeliveryInstructionsProps) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-xs text-gray-500">Help your driver find you easily.</p>
        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500">Optional</span>
      </div>

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g., Leave at front door, call upon arrival, gate code: 1234..."
        rows={3}
        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800 placeholder-gray-400 resize-none focus:border-orange-400 focus:ring-2 focus:ring-orange-200"
      />
      <p className="mt-2 text-xs text-gray-400">
        Instructions will be shared with the driver
      </p>
    </section>
  );
}
