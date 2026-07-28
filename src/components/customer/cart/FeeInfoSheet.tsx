"use client";

import {motion} from "framer-motion";
import {X} from "lucide-react";

export type FeeInfoType = "delivery" | "service" | "tax";

interface FeeInfoSheetProps {
  type: FeeInfoType;
  estimatedTax: number;
  onClose: () => void;
}

const feeContent: Record<
  FeeInfoType,
  {
    title: string;
    description: string;
  }
> = {
  delivery: {
    title: "Delivery Fee",
    description:
      "Delivery pricing is estimated from your store and delivery location. Eligible promotions, including free delivery, can reduce this fee.",
  },
  service: {
    title: "Service Fee",
    description:
      "This fee helps LIA operate the marketplace, support customer service, and provide a reliable ordering experience.",
  },
  tax: {
    title: "Estimated Tax",
    description:
      "The tax shown before checkout is an estimate. Your final tax is calculated when you place the order and appears on your receipt.",
  },
};

export function FeeInfoSheet({
  type,
  estimatedTax,
  onClose,
}: FeeInfoSheetProps) {
  const content = feeContent[type];

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end bg-black/45"
      initial={{opacity: 0}}
      animate={{opacity: 1}}
      exit={{opacity: 0}}
      onClick={onClose}
    >
      <motion.section
        role="dialog"
        aria-modal="true"
        aria-labelledby="fee-info-title"
        className="w-full rounded-t-[2rem] bg-white px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl sm:mx-auto sm:mb-6 sm:max-w-xl sm:rounded-3xl"
        initial={{y: "100%"}}
        animate={{y: 0}}
        exit={{y: "100%"}}
        transition={{type: "spring", damping: 28, stiffness: 320}}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-6 h-1.5 w-10 rounded-full bg-gray-200" />

        <div className="mb-5 flex items-start justify-between gap-4">
          <h2
            id="fee-info-title"
            className="text-2xl font-bold tracking-tight text-gray-900"
          >
            {content.title}
          </h2>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
            aria-label={`Close ${content.title} information`}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {type === "tax" && (
          <p className="mb-3 text-sm font-semibold text-gray-900">
            Estimated tax: ${estimatedTax.toFixed(2)}
          </p>
        )}

        <p className="text-base leading-relaxed text-gray-600">
          {content.description}
        </p>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-2xl bg-orange-600 py-3 text-base font-bold text-white transition hover:bg-orange-700"
        >
          OK
        </button>
      </motion.section>
    </motion.div>
  );
}
