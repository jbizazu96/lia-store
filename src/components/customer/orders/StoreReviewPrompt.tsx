"use client";

import {
  useEffect,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  Star,
  X,
} from "lucide-react";
import {
  customerStoreReviewClientService,
} from "@/services/store/customerStoreReviewClientService";

interface StoreReviewPromptProps {
  orderId: string;
  storeName: string;
}

export function StoreReviewPrompt({
  orderId,
  storeName,
}: StoreReviewPromptProps) {
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void customerStoreReviewClientService.get(orderId)
      .then(({ review }) => {
        if (!active) return;
        if (review) {
          setRating(review.rating);
          setSubmitted(true);
        } else {
          /*
           * A delivered order should actively invite a review each time its
           * detail page is opened. Closing the dialog is only a dismissal
           * for this visit; it does not mark the review as complete.
           */
          setOpen(true);
        }
      })
      .catch((cause) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "Unable to load your review.");
          setOpen(true);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [orderId]);

  const submit = async () => {
    if (!rating || saving) return;
    try {
      setSaving(true);
      setError(null);
      await customerStoreReviewClientService.submit(orderId, rating);
      setSubmitted(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to submit your review.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  if (submitted) {
    return (
      <section className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5 shadow-sm">
        <p className="font-semibold text-emerald-900">Thank you for reviewing {storeName}.</p>
        <p className="mt-1 text-sm text-emerald-800">Your verified {rating}-star review helps other customers shop with confidence.</p>
      </section>
    );
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="store-review-title"
    >
      <section className="w-full rounded-t-3xl bg-white px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 shadow-2xl sm:max-w-md sm:rounded-3xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-orange-600">
              Your order was delivered
            </p>
            <h2
              id="store-review-title"
              className="mt-1 text-xl font-bold text-gray-900"
            >
              How was {storeName}?
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-full p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
            aria-label="Close review"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-2 text-sm leading-6 text-gray-600">
          Share a verified rating based on this delivered order.
        </p>
        <div className="mt-5 flex justify-center gap-1" aria-label="Choose a rating">
          {[1, 2, 3, 4, 5].map((value) => (
            <button key={value} type="button" onClick={() => setRating(value)} className="rounded-full p-1 focus:outline-none focus:ring-2 focus:ring-orange-500" aria-label={`${value} star${value === 1 ? "" : "s"}`}>
              <Star className={"h-9 w-9 " + (value <= rating ? "fill-orange-400 text-orange-400" : "text-gray-300")} />
            </button>
          ))}
        </div>
        {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
        <button type="button" disabled={!rating || saving} onClick={() => void submit()} className="mt-4 w-full rounded-full bg-orange-500 py-3 text-sm font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50">
          {saving ? "Submitting review..." : "Submit review"}
        </button>
      </section>
    </div>,
    document.body,
  );
}
