"use client";

/* One customer-facing entry point for private LIA order support and claims. */

import {
  Headphones,
  RotateCcw,
} from "lucide-react";
import {
  useState,
} from "react";
import {
  OrderHelpCard,
} from "@/components/customer/orders/OrderHelpCard";
import {
  RefundClaimCard,
} from "@/components/customer/orders/RefundClaimCard";

type HelpView = "support" | "claim" | null;

export function OrderHelpSection({
  orderId,
  canRequestRefund,
}: {
  orderId: string;
  canRequestRefund: boolean;
}) {
  const [activeView, setActiveView] =
    useState<HelpView>(null);

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
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
            className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${
              activeView === "support"
                ? "border-blue-200 bg-blue-50"
                : "border-gray-200 bg-white hover:bg-gray-50"
            }`}
          >
            <Headphones className="mt-0.5 h-5 w-5 flex-none text-blue-700" />
            <span>
              <span className="block text-sm font-bold text-gray-900">
                Get order help
              </span>
              <span className="mt-0.5 block text-xs leading-5 text-gray-600">
                Late delivery, missing items, or general support.
              </span>
            </span>
          </button>

          {canRequestRefund && (
            <button
              type="button"
              onClick={() => setActiveView("claim")}
              className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${
                activeView === "claim"
                  ? "border-orange-200 bg-orange-50"
                  : "border-gray-200 bg-white hover:bg-gray-50"
              }`}
            >
              <RotateCcw className="mt-0.5 h-5 w-5 flex-none text-orange-600" />
              <span>
                <span className="block text-sm font-bold text-gray-900">
                  Request a refund or return
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-gray-600">
                  Submit a payment-related claim for LIA Admin review.
                </span>
              </span>
            </button>
          )}
        </div>
      </div>

      {activeView && (
        <div className="p-5">
          {activeView === "claim" && canRequestRefund ? (
          <RefundClaimCard orderId={orderId} embedded />
          ) : (
            <OrderHelpCard orderId={orderId} embedded />
          )}
        </div>
      )}
    </section>
  );
}
