"use client";

import {ArrowLeft} from "lucide-react";

interface CheckoutHeaderProps {
  onBack: () => void;
  title?: string;
}

export function CheckoutHeader({onBack, title = "Checkout"}: CheckoutHeaderProps) {
  return (
    <div className="bg-white border-b border-gray-100 sticky top-0 z-20">
      <div className="flex items-center gap-3 px-4 py-4 max-w-lg mx-auto">
        <button
          onClick={onBack}
          className="p-2 hover:bg-gray-100 rounded-full transition"
          aria-label="Go back"
        >
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <h1 className="text-xl font-bold text-gray-800">{title}</h1>
      </div>
    </div>
  );
}