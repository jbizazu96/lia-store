"use client";

import {useEffect, useState} from "react";
import {LoaderCircle, RotateCcw} from "lucide-react";
import {refundClaimClientService} from "@/services/refund/refundClaimClientService";

const reasons = [
  ["missing_items", "Missing item"],
  ["incorrect_items", "Incorrect item"],
  ["damaged_items", "Damaged item"],
  ["quality_issue", "Quality issue"],
  ["delivery_failed", "Delivery issue"],
  ["duplicate_charge", "Duplicate charge"],
  ["other", "Other"],
] as const;

type Claim = Awaited<ReturnType<typeof refundClaimClientService.get>>["claim"];

function label(value: string): string {
  return value.replace(/_/g, " ");
}

export function RefundClaimCard({
  orderId,
  embedded = false,
}: {
  orderId: string;
  embedded?: boolean;
}) {
  const [claim, setClaim] = useState<Claim>(null);
  const [reason, setReason] = useState<string>(reasons[0][0]);
  const [description, setDescription] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    void refundClaimClientService.get(orderId)
      .then((result) => {
        if (active) setClaim(result.claim);
      })
      .catch((loadError) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load your support request.",
          );
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
    if (!description.trim()) {
      setError("Please describe the issue before submitting.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await refundClaimClientService.create({
        orderId,
        reason,
        description: description.trim(),
      });

      const result = await refundClaimClientService.get(orderId);
      setClaim(result.claim);
      setShowForm(false);
      setDescription("");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to submit your claim.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <LoaderCircle className="h-4 w-4 animate-spin text-orange-500" />
        Checking support options…
      </div>
    );
  }

  if (claim) {
    return (
      <section className={embedded ? "" : "rounded-2xl border border-orange-100 bg-orange-50 p-5 shadow-sm"}>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-orange-100">
            <RotateCcw className="h-5 w-5 text-orange-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">
              Refund claim {label(claim.status)}
            </h3>
            <p className="mt-1 text-sm leading-6 text-gray-700">
              You reported {label(claim.reason)}. We will notify you after it
              has been reviewed.
              {claim.refundStatus
                ? " Refund status: " + label(claim.refundStatus) + "."
                : ""}
            </p>
            {claim.decisionReason && (
              <p className="mt-2 text-sm font-medium text-gray-800">
                Review note: {claim.decisionReason}
              </p>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={embedded ? "" : "rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"}>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-orange-100">
          <RotateCcw className="h-5 w-5 text-orange-600" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-800">
            Need help with this order?
          </h3>
          <p className="mt-1 text-sm leading-6 text-gray-500">
            Report an item or delivery issue for Admin review.
          </p>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {!showForm ? (
        <button
          type="button"
          onClick={() => {
            setError("");
            setShowForm(true);
          }}
          className="mt-4 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600"
        >
          Start a refund or return claim
        </button>
      ) : (
        <div className="mt-4 space-y-3 rounded-xl bg-gray-50 p-4">
          <label className="block text-sm font-semibold text-gray-700">
            What happened?
            <select
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="mt-2 block w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800"
            >
              {reasons.map(([value, reasonLabel]) => (
                <option key={value} value={value}>{reasonLabel}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold text-gray-700">
            Tell us what went wrong
            <textarea
              value={description}
              maxLength={2000}
              rows={4}
              onChange={(event) => setDescription(event.target.value)}
              className="mt-2 block w-full rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-800"
              placeholder="Include the affected items or delivery details."
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => void submit()}
              className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:opacity-60"
            >
              {saving && <LoaderCircle className="h-4 w-4 animate-spin" />}
              Submit claim
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setError("");
                setShowForm(false);
              }}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
