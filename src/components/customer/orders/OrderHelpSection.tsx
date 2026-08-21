"use client";

/* One customer-facing entry point for private LIA order support and claims. */

import {
  ChevronRight,
  Headphones,
  RotateCcw,
} from "lucide-react";
import {
  useEffect,
  useState,
} from "react";
import {
  OrderHelpCard,
} from "@/components/customer/orders/OrderHelpCard";
import {
  RefundClaimCard,
} from "@/components/customer/orders/RefundClaimCard";
import {refundClaimClientService} from "@/services/refund/refundClaimClientService";
import {orderSupportClientService} from "@/services/order/orderSupportClientService";

type HelpView = "support" | "claim" | null;

export function OrderHelpSection({
  orderId,
  canRequestRefund,
  deliveryFailureOnly = false,
}: {
  orderId: string;
  canRequestRefund: boolean;
  deliveryFailureOnly?: boolean;
}) {
  const [activeView, setActiveView] =
    useState<HelpView>(null);

  useEffect(() => {
    let active = true;

    void Promise.allSettled([
      refundClaimClientService.get(orderId),
      orderSupportClientService.getCustomer(orderId),
    ]).then(([claimResult, supportResult]) => {
      if (!active) return;

      if (claimResult.status === "fulfilled" && claimResult.value.claim) {
        setActiveView("claim");
      } else if (
        supportResult.status === "fulfilled" &&
        supportResult.value.request
      ) {
        setActiveView("support");
      }
    });

    return () => {
      active = false;
    };
  }, [orderId]);

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_6px_18px_rgba(15,23,42,0.08)]">
      <div className="border-b border-gray-100 p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-orange-600">
          Order help
        </p>
        <h2 className="mt-1 text-lg font-bold text-gray-900">
          How can LIA help?
        </h2>
        <p className="mt-1 text-sm leading-6 text-gray-600">
          LIA Support is your only point of contact and will work with the
          store when needed.
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setActiveView("support")}
            className={`group flex items-center gap-3 rounded-2xl border-2 p-4 text-left shadow-sm transition hover:-translate-y-0.5 ${
              activeView === "support"
                ? "border-blue-300 bg-blue-50"
                : "border-gray-200 bg-white hover:border-blue-200 hover:bg-blue-50/40"
            }`}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
              <Headphones className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-gray-900">
                Get order help
              </span>
              <span className="mt-0.5 block text-xs leading-5 text-gray-600">
                Late delivery, missing items, or general support.
              </span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-blue-600 transition group-hover:translate-x-0.5" />
          </button>

          {canRequestRefund && (
            <button
              type="button"
              onClick={() => setActiveView("claim")}
              className={`group flex items-center gap-3 rounded-2xl border-2 p-4 text-left shadow-sm transition hover:-translate-y-0.5 ${
                activeView === "claim"
                  ? "border-orange-300 bg-orange-50"
                  : "border-gray-200 bg-white hover:border-orange-200 hover:bg-orange-50/40"
              }`}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600">
                <RotateCcw className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-gray-900">
                  Request a refund
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-gray-600">
                  Submit a payment-related claim for LIA Admin review.
                </span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-orange-600 transition group-hover:translate-x-0.5" />
            </button>
          )}
        </div>
      </div>

      {activeView && (
        <div className="p-5">
          {activeView === "claim" && canRequestRefund ? (
          <RefundClaimCard orderId={orderId} embedded deliveryFailureOnly={deliveryFailureOnly} />
          ) : (
            <OrderHelpCard orderId={orderId} embedded />
          )}
        </div>
      )}
    </section>
  );
}
