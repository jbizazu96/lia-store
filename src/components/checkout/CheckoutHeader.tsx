"use client";

import {ArrowLeft} from "lucide-react";

interface CheckoutHeaderProps {
  onBack: () => void;
  title?: string;
}

export function CheckoutHeader({onBack, title = "Checkout"}: CheckoutHeaderProps) {
  return (
    <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-xl">
      <div className="relative flex items-center px-4 py-4 max-w-lg mx-auto">
        <button
          onClick={onBack}
          className="p-2 hover:bg-gray-100 rounded-full transition"
          aria-label="Go back"
        >
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <h1 className="pointer-events-none absolute inset-x-0 text-center text-xl font-bold text-gray-800">{title}</h1>
      </div>
    </div>
  );
}
