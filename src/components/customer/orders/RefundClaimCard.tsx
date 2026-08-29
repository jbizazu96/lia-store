"use client";

import {useEffect, useState} from "react";
import {createPortal} from "react-dom";
import {Camera, Check, Circle, ImagePlus, LoaderCircle, RotateCcw, Upload} from "lucide-react";
import {refundClaimClientService} from "@/services/refund/refundClaimClientService";

const reasons = [
  ["missing_items", "Missing item"],
  ["incorrect_items", "Incorrect item"],
  ["damaged_items", "Damaged item"],
  ["quality_issue", "Quality issue"],
  ["delivery_failed", "Delivery issue"],
  ["pickup_failed", "Pickup failed"],
  ["duplicate_charge", "Duplicate charge"],
  ["other", "Other"],
] as const;

type Claim = Awaited<ReturnType<typeof refundClaimClientService.get>>["claim"];

function label(value: string): string {
  return value.replace(/_/g, " ");
}

function displayDate(value: string | null): string | null {
  if (!value) return null;

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
}

function ClaimTimeline({claim}: {claim: NonNullable<Claim>}) {
  const isPending = claim.status === "pending_review";
  const isApproved = claim.status === "approved";
  const isRejected = claim.status === "rejected";
  const isRefunded = claim.refundStatus === "completed";
  const steps = [
    {
      label: "Submitted",
      detail: displayDate(claim.createdAt) || "Received by LIA Admin",
      complete: true,
      current: false,
    },
    {
      label: "Under review",
      detail: isPending
        ? "LIA Admin is reviewing your claim"
        : "Review completed",
      complete: !isPending,
      current: isPending,
    },
    {
      label: isRejected ? "Rejected" : isApproved ? "Approved" : "Decision pending",
      detail: isRejected || isApproved
        ? displayDate(claim.decisionAt) || "Decision recorded"
        : "Waiting for review",
      complete: isRejected || isApproved,
      current: false,
    },
    {
      label: isRefunded ? "Refunded" : "Refund",
      detail: isRejected
        ? "No refund was issued"
        : isRefunded
          ? displayDate(claim.refundCompletedAt) || "Refund completed"
          : isApproved
            ? claim.refundStatus
              ? `Refund ${label(claim.refundStatus)}`
              : "Refund is being prepared"
            : "Available after approval",
      complete: isRefunded,
      current: isApproved && !isRefunded,
    },
  ];

  return (
    <div className="mt-5 border-t border-orange-200 pt-4">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
        Claim timeline
      </p>
      <ol className="mt-3 space-y-3">
        {steps.map((step, index) => (
          <li key={step.label} className="relative flex gap-3">
            {index < steps.length - 1 && (
              <span
                className={
                  "absolute left-[9px] top-5 h-6 w-px " +
                  (step.complete ? "bg-green-300" : "bg-gray-200")
                }
              />
            )}
            <span
              className={
                "relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full " +
                (step.complete
                  ? "bg-green-600 text-white"
                  : step.current
                    ? "bg-orange-500 text-white"
                    : "bg-gray-200 text-gray-400")
              }
            >
              {step.complete ? <Check className="h-3 w-3" /> : <Circle className="h-2.5 w-2.5" />}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-gray-800">
                {step.label}
              </span>
              <span className="block text-xs text-gray-500">{step.detail}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function RefundClaimCard({
  orderId,
  embedded = false,
  fulfillmentType,
  fulfillmentFailureOnly = false,
}: {
  orderId: string;
  embedded?: boolean;
  fulfillmentType: "delivery" | "pickup";
  fulfillmentFailureOnly?: boolean;
}) {
  const [claim, setClaim] = useState<Claim>(null);
  const fulfillmentFailureReason = fulfillmentType === "pickup"
    ? "pickup_failed"
    : "delivery_failed";
  const availableReasons = fulfillmentFailureOnly
    ? reasons.filter(([value]) => value === fulfillmentFailureReason)
    : reasons.filter(([value]) =>
      value !== (fulfillmentType === "pickup" ? "delivery_failed" : "pickup_failed")
    );
  const [reason, setReason] = useState<string>(
    fulfillmentFailureOnly ? fulfillmentFailureReason : reasons[0][0],
  );
  const [description, setDescription] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidencePickerOpen, setEvidencePickerOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const evidenceRequired =
    reason === "damaged_items" ||
    reason === "quality_issue";

  const chooseEvidenceFile = (file: File | null) => {
    if (file) {
      setEvidenceFile(file);
    }

    setEvidencePickerOpen(false);
    setError("");
  };

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

    if (evidenceRequired && !evidenceFile) {
      setError(
        "Add a clear photo showing the damage or quality issue before submitting.",
      );
      return;
    }

    setSaving(true);
    setError("");

    try {
      const evidence = evidenceRequired && evidenceFile
        ? await refundClaimClientService.uploadPhotoEvidence({
          orderId,
          reason,
          file: evidenceFile,
        })
        : null;

      await refundClaimClientService.create({
        orderId,
        reason,
        description: description.trim(),
        ...(evidence ? {evidenceUploadId: evidence.uploadId} : {}),
      });

      const result = await refundClaimClientService.get(orderId);
      setClaim(result.claim);
      setShowForm(false);
      setDescription("");
      setEvidenceFile(null);
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
      <section className="animate-pulse rounded-2xl border border-gray-100 bg-white/70 p-5 shadow-sm" aria-label="Loading refund claim options">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-full bg-gray-200" />
          <div className="flex-1 space-y-2"><div className="h-4 w-36 rounded bg-gray-200" /><div className="h-3 w-4/5 rounded bg-gray-100" /></div>
        </div>
      </section>
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
            {claim.hasPhotoEvidence && (
              <p className="mt-2 text-sm font-medium text-gray-800">
                Photo evidence was attached for Admin review.
              </p>
            )}
            {claim.decisionReason && (
              <p className="mt-2 text-sm font-medium text-gray-800">
                Review note: {claim.decisionReason}
              </p>
            )}
            <ClaimTimeline claim={claim} />
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
          className="mt-4 rounded-full bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600"
        >
          Start a refund claim
        </button>
      ) : (
        <div className="mt-4 space-y-3 rounded-xl bg-gray-50 p-4">
          <label className="block text-sm font-semibold text-gray-700">
            What happened?
            <select
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setError("");
              }}
              className="mt-2 block w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800"
            >
              {availableReasons.map(([value, reasonLabel]) => (
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
          {evidenceRequired && (
            <label className="block text-sm font-semibold text-gray-700">
              Photo evidence required
              <span className="mt-1 block text-xs font-normal leading-5 text-gray-500">
                Add a clear photo of the damage or quality issue. Only LIA
                Admin can view it while reviewing your claim.
              </span>
              <button
                type="button"
                onClick={() => setEvidencePickerOpen(true)}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-full border border-dashed border-orange-300 bg-orange-50 px-3 py-3 text-sm font-semibold text-orange-700 transition hover:bg-orange-100"
              >
                <ImagePlus className="h-4 w-4" />
                {evidenceFile ? evidenceFile.name : "Choose photo"}
              </button>
            </label>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => void submit()}
              className="inline-flex items-center gap-2 rounded-full bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:opacity-60"
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
              className="rounded-full px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {evidencePickerOpen && typeof document !== "undefined" && createPortal((
        <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="w-full rounded-t-3xl bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 shadow-2xl sm:max-w-sm sm:rounded-3xl sm:p-5">
            <h3 className="text-lg font-bold text-gray-900">
              Add photo evidence
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Choose how you want to add your photo.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <label className="flex cursor-pointer flex-col items-center rounded-2xl border border-gray-200 p-4 hover:bg-orange-50">
                <Camera className="mb-2 h-7 w-7 text-orange-600" />
                <span className="text-sm font-semibold">Take photo</span>
                <input
                  hidden
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(event) =>
                    chooseEvidenceFile(event.target.files?.[0] ?? null)
                  }
                />
              </label>
              <label className="flex cursor-pointer flex-col items-center rounded-2xl border border-gray-200 p-4 hover:bg-orange-50">
                <Upload className="mb-2 h-7 w-7 text-orange-600" />
                <span className="text-sm font-semibold">Upload image</span>
                <input
                  hidden
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  onChange={(event) =>
                    chooseEvidenceFile(event.target.files?.[0] ?? null)
                  }
                />
              </label>
            </div>
            <button
              type="button"
              onClick={() => setEvidencePickerOpen(false)}
              className="mt-4 w-full rounded-full py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </div>
      ), document.body)}
    </section>
  );
}
