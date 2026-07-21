"use client";

/*
|--------------------------------------------------------------------------
| Order Timeline
|--------------------------------------------------------------------------
|
| Displays the progress of an order using the shared order-status
| configuration.
|
*/

import {
  ORDER_STATUS_STEPS,
} from "@/config/orderStatus";

import {
  getCurrentOrderStep,
} from "@/utils/orderDisplay";

interface OrderTimelineProps {
  currentStatus: string;
}

export function OrderTimeline({
  currentStatus,
}: OrderTimelineProps) {
  const currentStepIndex =
    getCurrentOrderStep(
      currentStatus as never
    );

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        {ORDER_STATUS_STEPS.map(
          (step, index) => {
            const isCompleted =
              index <=
              currentStepIndex;

            const Icon =
              step.icon;

            return (
              <div
                key={step.key}
                className="flex flex-1 items-center"
              >
                <div
                  className={`flex flex-1 flex-col items-center ${
                    index > 0
                      ? "ml-[-8px]"
                      : ""
                  }`}
                >
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full ${
                      isCompleted
                        ? "bg-green-500"
                        : "bg-gray-200"
                    }`}
                  >
                    <Icon
                      className={`h-5 w-5 ${
                        isCompleted
                          ? "text-white"
                          : "text-gray-400"
                      }`}
                    />
                  </div>

                  <p
                    className={`mt-1 text-xs font-medium ${
                      isCompleted
                        ? "text-gray-800"
                        : "text-gray-400"
                    }`}
                  >
                    {step.label}
                  </p>
                </div>

                {index <
                  ORDER_STATUS_STEPS.length -
                    1 && (
                  <div
                    className={`h-0.5 flex-1 ${
                      index <
                      currentStepIndex
                        ? "bg-green-500"
                        : "bg-gray-200"
                    }`}
                  />
                )}
              </div>
            );
          }
        )}
      </div>
    </div>
  );
}