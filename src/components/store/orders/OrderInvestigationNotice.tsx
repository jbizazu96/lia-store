"use client";

/*
|--------------------------------------------------------------------------
| Store Order Investigation Notice
|--------------------------------------------------------------------------
|
| Shows the non-sensitive status of a LIA-managed claim or report. Customer
| and admin notes are intentionally excluded: LIA remains the only bridge
| between the customer and store.
|
*/

import {
  ShieldAlert,
} from "lucide-react";
import type {
  OrderInvestigation,
} from "@/types/order";

interface OrderInvestigationNoticeProps {
  investigation?: OrderInvestigation;
  compact?: boolean;
}

function label(
  value: string | null | undefined
): string {
  return value
    ? value.replace(/_/g, " ")
    : "in review";
}

export function OrderInvestigationNotice({
  investigation,
  compact = false,
}: OrderInvestigationNoticeProps) {
  if (!investigation?.active) {
    return null;
  }

  const topics = [
    investigation.hasRefundClaim
      ? "refund claim " + label(investigation.refundClaimStatus)
      : null,
    investigation.hasSupportReport
      ? "customer report " + label(investigation.supportRequestStatus)
      : null,
  ].filter(Boolean);

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">
        <ShieldAlert className="h-3.5 w-3.5" />
        LIA review
      </span>
    );
  }

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-amber-100">
          <ShieldAlert className="h-5 w-5 text-amber-700" />
        </div>
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wide text-amber-800">
            LIA investigation in progress
          </p>
          <h2 className="mt-1 font-bold">
            This order is under LIA review
          </h2>
          <p className="mt-1 text-sm leading-6 text-amber-900">
            {topics.length > 0
              ? "Case status: " + topics.join(" · ") + "."
              : "LIA Support is reviewing this order."} Do not contact the customer directly; LIA will coordinate any required follow-up.
          </p>
        </div>
      </div>
    </section>
  );
}
