"use client";

import {useEffect} from "react";
import {createPortal} from "react-dom";
import {AnimatePresence, motion} from "framer-motion";
import {X} from "lucide-react";
import type {MarketplacePricingPolicy} from "@/services/pricing/marketplacePricingClientService";

interface PricingFeesModalProps {
  open: boolean;
  onClose: () => void;
  deliveryFee: number;
  policy: MarketplacePricingPolicy | null;
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function PricingFeesModal({
  open,
  onClose,
  deliveryFee,
  policy,
}: PricingFeesModalProps) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose, open]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center sm:p-5">
          <motion.button
            type="button"
            aria-label="Close pricing and fees"
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            onClick={onClose}
          />
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby="pricing-fees-title"
            initial={{opacity: 0, y: 80}}
            animate={{opacity: 1, y: 0}}
            exit={{opacity: 0, y: 80}}
            transition={{type: "spring", damping: 28, stiffness: 320}}
            className="relative max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-[32px] bg-white px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-5 shadow-2xl sm:rounded-[32px] sm:p-7"
          >
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2 id="pricing-fees-title" className="text-xl font-black tracking-[-0.03em] text-slate-950">
                Pricing &amp; Fees
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200"
                aria-label="Close"
                autoFocus
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 text-[13px] leading-5 text-slate-600 sm:text-sm sm:leading-6">
              <div>
                <h3 className="font-extrabold text-slate-900">Item prices</h3>
                <p className="mt-1">Stores provide the prices shown in LIA. Prices and promotions may differ from those offered in the physical store and can change before checkout.</p>
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900">Service fee</h3>
                <p className="mt-1">
                  LIA applies a service fee to support ordering, payment processing, and customer service.
                  {policy && ` Delivery orders use ${(policy.serviceFeeRate * 100).toFixed(1)}%, with a minimum of ${money(policy.minimumServiceFeeCents)} and a maximum of ${money(policy.maximumServiceFeeCents)}. Pickup orders use ${((policy.pickupServiceFeeRate ?? policy.serviceFeeRate) * 100).toFixed(1)}%, with a minimum of ${money(policy.pickupMinimumServiceFeeCents ?? policy.minimumServiceFeeCents)} and a maximum of ${money(policy.pickupMaximumServiceFeeCents ?? policy.maximumServiceFeeCents)}.`}
                </p>
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900">Delivery fee</h3>
                <p className="mt-1">
                  Delivery pricing is based on the driving distance to your selected address. The current estimate for this store is {deliveryFee === 0 ? "free" : `$${deliveryFee.toFixed(2)}`}.
                  {policy && ` Delivery becomes free when the qualifying item subtotal reaches ${money(policy.freeDeliveryMinimumCents)}.`}
                </p>
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900">Taxes and tip</h3>
                <p className="mt-1">Applicable taxes are calculated at checkout. Driver tips are optional and separate from LIA’s delivery and service fees. Your final total is shown before payment.</p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="mt-7 w-full rounded-full bg-orange-500 px-5 py-3.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
            >
              Got it
            </button>
          </motion.section>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
