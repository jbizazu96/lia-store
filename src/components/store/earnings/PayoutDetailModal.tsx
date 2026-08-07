"use client";

import {
  ReceiptText,
  X,
} from "lucide-react";
import type {
  StoreWorkspacePayout,
} from "@/services/store/storeWorkspaceClientService";
import {
  displayOrderNumber,
} from "@/utils/orderDisplay";

interface PayoutDetailModalProps {
  payout: StoreWorkspacePayout;
  onClose: () => void;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not available"
    : date.toLocaleString();
}

/*
 * Payout information is returned only by the authenticated store-workspace
 * callable. This component only presents that server-authorized response.
 */
export function PayoutDetailModal({
  payout,
  onClose,
}: PayoutDetailModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-slate-950/40 p-0 sm:items-center sm:justify-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="payout-detail-title"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:max-w-lg sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-green-50 p-3">
              <ReceiptText className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-green-700">STORE EARNING</p>
              <h2 id="payout-detail-title" className="text-xl font-bold text-slate-900">Payout details</h2>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" aria-label="Close payout details">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 rounded-2xl bg-slate-50 p-4">
          <p className="text-sm text-slate-500">Final store transfer</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">${payout.amount.toFixed(2)}</p>
          <p className="mt-1 text-sm capitalize text-slate-500">{payout.status}</p>
        </div>

        <div className="mt-5 space-y-3 text-sm">
          <div className="flex justify-between gap-4"><span className="text-slate-500">Merchandise subtotal</span><span className="font-medium">${payout.merchandiseSubtotal.toFixed(2)}</span></div>
          <div className="flex justify-between gap-4"><span className="text-slate-500">Sales tax passed to store</span><span className="font-medium">${payout.salesTax.toFixed(2)}</span></div>
          <div className="flex justify-between gap-4 border-t border-slate-100 pt-3"><span className="font-medium text-slate-700">Gross store order amount</span><span className="font-semibold">${payout.grossStoreOrderAmount.toFixed(2)}</span></div>
          <div className="flex justify-between gap-4 text-orange-700"><span>LIA commission</span><span>−${payout.liaCommission.toFixed(2)}</span></div>
          <div className="flex justify-between gap-4 border-t border-slate-200 pt-3 text-base"><span className="font-bold">Your transfer</span><span className="font-bold text-green-700">${payout.amount.toFixed(2)}</span></div>
        </div>

        <div className="mt-6 space-y-2 rounded-2xl border border-slate-100 p-4 text-sm">
          <div className="flex justify-between gap-4"><span className="text-slate-500">Order number</span><span className="max-w-[60%] truncate font-medium">Order {displayOrderNumber(payout.orderNumber)}</span></div>
          <div className="flex justify-between gap-4"><span className="text-slate-500">Earning created</span><span className="text-right font-medium">{formatDate(payout.createdAt)}</span></div>
          {payout.status === "completed" && <div className="flex justify-between gap-4"><span className="text-slate-500">Paid through Stripe</span><span className="text-right font-medium">{formatDate(payout.completedAt)}</span></div>}
          <div className="flex justify-between gap-4"><span className="text-slate-500">Payout reference</span><span className="max-w-[60%] truncate font-medium">{payout.id}</span></div>
        </div>

        <p className="mt-5 text-xs leading-5 text-slate-500">Delivery fees, service fees, and customer tips are not part of this store payout.</p>
      </div>
    </div>
  );
}
