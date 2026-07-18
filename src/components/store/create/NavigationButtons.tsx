"use client";

import {memo} from "react";
import {ArrowLeft, ArrowRight} from "lucide-react";

interface NavigationButtonsProps {
  currentStep: number;
  totalSteps: number;
  loading: boolean;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
}

export const NavigationButtons = memo(({
  currentStep,
  totalSteps,
  loading,
  onBack,
  onNext,
  onSubmit,
}: NavigationButtonsProps) => (
  <div className="flex gap-3 mt-6">
    {currentStep > 1 && (
      <button
        onClick={onBack}
        disabled={loading}
        className="flex-1 py-3 px-4 border border-gray-200 rounded-xl text-gray-600 font-medium hover:bg-gray-50 transition disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
    )}

    {currentStep < totalSteps ? (
      <button
        onClick={onNext}
        className="flex-1 py-3 px-4 bg-gradient-to-r from-orange-600 to-orange-700 text-white rounded-xl font-semibold hover:shadow-lg transition flex items-center justify-center gap-2"
      >
        Next <ArrowRight className="w-4 h-4" />
      </button>
    ) : (
      <button
        onClick={onSubmit}
        disabled={loading}
        className="flex-1 py-3 px-4 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-xl font-semibold hover:shadow-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {loading ? (
          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <>
            Create Store <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>
    )}
  </div>
));

NavigationButtons.displayName = "NavigationButtons";