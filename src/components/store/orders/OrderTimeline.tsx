"use client";

/*
  Order status timeline with visual steps.
*/

import {Clock, CheckCircle, Package, Truck} from "lucide-react";

interface OrderTimelineProps {
  currentStatus: string;
}

const STATUS_STEPS = [
  {key: "pending", label: "Pending", icon: Clock},
  {key: "accepted", label: "Accepted", icon: CheckCircle},
  {key: "preparing", label: "Preparing", icon: Package},
  {key: "ready_for_pickup", label: "Ready for Pickup", icon: Truck},
  {key: "out_for_delivery", label: "Out for Delivery", icon: Truck},
  {key: "completed", label: "Completed", icon: CheckCircle},
];

export function OrderTimeline({currentStatus}: OrderTimelineProps) {
  const currentStepIndex = STATUS_STEPS.findIndex(s => s.key === currentStatus);

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between">
        {STATUS_STEPS.map((step, index) => {
          const isCompleted = index <= currentStepIndex;
          const Icon = step.icon;

          return (
            <div key={step.key} className="flex-1 flex items-center">
              <div className={`flex flex-col items-center flex-1 ${index > 0 ? "ml-[-8px]" : ""}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  isCompleted ? "bg-green-500" : "bg-gray-200"
                }`}>
                  <Icon className={`w-5 h-5 ${isCompleted ? "text-white" : "text-gray-400"}`} />
                </div>
                <p className={`text-xs font-medium mt-1 ${
                  isCompleted ? "text-gray-800" : "text-gray-400"
                }`}>
                  {step.label}
                </p>
              </div>
              {index < STATUS_STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 ${
                  index < currentStepIndex ? "bg-green-500" : "bg-gray-200"
                }`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}