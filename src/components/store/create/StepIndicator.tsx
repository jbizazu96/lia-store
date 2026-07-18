"use client";

import {memo} from "react";
import {CheckCircle} from "lucide-react";

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
}

export const StepIndicator = memo(({currentStep, totalSteps}: StepIndicatorProps) => (
  <div className="flex justify-center gap-2 mb-8">
    {Array.from({length: totalSteps}, (_, i) => i + 1).map((step) => (
      <div key={step} className="flex items-center gap-2">
        <div className={`
          w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition
          ${step === currentStep ? "bg-orange-600 text-white" : ""}
          ${step < currentStep ? "bg-green-500 text-white" : ""}
          ${step > currentStep ? "bg-gray-200 text-gray-500" : ""}
        `}>
          {step < currentStep ? <CheckCircle className="w-5 h-5" /> : step}
        </div>
        {step < totalSteps && (
          <div className={`w-12 h-0.5 ${step < currentStep ? "bg-green-500" : "bg-gray-200"}`} />
        )}
      </div>
    ))}
  </div>
));

StepIndicator.displayName = "StepIndicator";