"use client";

/*
|--------------------------------------------------------------------------
| Admin Refund Claims Workspace
|--------------------------------------------------------------------------
|
| The page reviews customer support claims. The Admin can select the refund
| scope, but the callable validates trusted payment data and creates the
| refund obligation; this browser never updates payment records directly.
|
*/

import {
  useEffect,
  useState,
} from "react";
import {
  ChevronRight,
  LoaderCircle,
  RotateCcw,
  X,
} from "lucide-react";
import {
  useRouter,
  useSearchParams,
} from "next/navigation";
import {
  adminWorkspaceClientService,
} from "@/services/admin/adminWorkspaceClientService";
import type {
  AdminRefundClaimDetail,
  AdminRefundClaimListItem,
} from "@/types/adminWorkspace";

type ClaimStatus =
  | "pending_review"
  | "approved"
  | "rejected";

type RefundAmounts = {
  merchandiseAmount: string;
  taxAmount: string;
  deliveryFeeAmount: string;
  serviceFeeAmount: string;
  driverTipAmount: string;
};

const claimStatuses: ClaimStatus[] = [
  "pending_review",
  "approved",
  "rejected",
];

function money(
  value: number,
  currency: string
): string {
  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency: currency.toUpperCase(),
    }
  ).format(value / 100);
}

function label(value: string): string {
  return value.replace(/_/g, " ");
}

function displayDate(value: string | null): string {
  if (!value) return "Not recorded";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Not recorded";

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function AdminRefundClaimsWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] =
    useState<ClaimStatus>("pending_review");
  const [claims, setClaims] =
    useState<AdminRefundClaimListItem[]>([]);
  const [counts, setCounts] = useState({
    pending_review: 0,
    approved: 0,
    rejected: 0,
  });
  const [selected, setSelected] =
    useState<AdminRefundClaimDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);

    try {
      const result =
        await adminWorkspaceClientService.getRefundClaims(
          status
        );

      setClaims(result.claims);
      setCounts(result.counts);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to load claims."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [status]);

  const open = async (claimId: string) => {
    try {
      setSelected(
        await adminWorkspaceClientService.getRefundClaim(
          claimId
        )
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to load claim."
      );
    }
  };

  useEffect(() => {
    const claimId = searchParams.get("claim");

    if (claimId) void open(claimId);
  }, [searchParams]);

  const decide = async (
    decision: "approved" | "rejected",
    scope: "full" | "partial",
    amounts?: Record<string, number>,
    note?: string,
  ) => {
    if (!selected) return;

    setWorking(true);

    try {
      await adminWorkspaceClientService.decideRefundClaim({
        claimId: selected.id,
        decision,
        scope,
        ...(amounts ? {amounts} : {}),
        ...(note ? {note} : {}),
      });

      setSelected(null);
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to decide claim."
      );
    } finally {
      setWorking(false);
    }
  };

  return (
    <section>
      <p className="text-sm font-bold tracking-wide text-orange-600">
        CUSTOMER SUPPORT
      </p>
      <h1 className="mt-1 text-3xl font-bold">
        Refund & return claims
      </h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-600">
        Customer requests are reviewed here. Approval creates a trusted
        refund obligation; the scheduler handles Stripe reversals and the
        customer refund.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {claimStatuses.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatus(value)}
            className={
              "rounded-xl px-4 py-2 text-sm font-bold " +
              (status === value
                ? "bg-orange-600 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200")
            }
          >
            {label(value)} ({counts[value]})
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <Loading />
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
          {claims.length === 0 ? (
            <p className="p-10 text-center text-sm text-slate-500">
              No claims in this queue.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {claims.map((claim) => (
                <button
                  key={claim.id}
                  type="button"
                  onClick={() => void open(claim.id)}
                  className="flex w-full items-center gap-4 p-5 text-left hover:bg-orange-50"
                >
                  <RotateCcw className="h-5 w-5 text-orange-600" />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold capitalize">
                      {label(claim.reason)}
                    </p>
                    <p className="mt-1 truncate text-sm text-slate-500">
                      Order #{claim.orderNumber} · {claim.customerName}
                    </p>
                  </div>
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
                    {label(claim.status)}
                  </span>
                  <ChevronRight className="h-5 w-5 text-slate-400" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {selected && (
        <ClaimModal
          detail={selected}
          working={working}
          onClose={() => {
            setSelected(null);
            router.replace("/admin/refund-claims");
          }}
          onDecide={decide}
        />
      )}
    </section>
  );
}

function ClaimModal({
  detail,
  working,
  onClose,
  onDecide,
}: {
  detail: AdminRefundClaimDetail;
  working: boolean;
  onClose: () => void;
  onDecide: (
    decision: "approved" | "rejected",
    scope: "full" | "partial",
    amounts?: Record<string, number>,
    note?: string,
  ) => void;
}) {
  const [mode, setMode] =
    useState<"full" | "partial">("full");
  const [note, setNote] = useState("");
  const [amounts, setAmounts] = useState<RefundAmounts>({
    merchandiseAmount: "",
    taxAmount: "",
    deliveryFeeAmount: "",
    serviceFeeAmount: "",
    driverTipAmount: "",
  });

  const partialAmounts = Object.fromEntries(
    Object.entries(amounts).map(([key, value]) => [
      key,
      Math.round((Number(value) || 0) * 100),
    ])
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/35 sm:items-center sm:justify-center sm:p-6">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl">
        <div className="flex justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-orange-600">
              REFUND CLAIM
            </p>
            <h2 className="text-2xl font-bold capitalize">
              {label(detail.reason)}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 hover:bg-slate-100"
            aria-label="Close refund claim"
          >
            <X />
          </button>
        </div>

        <section className="mt-4 rounded-xl bg-slate-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Customer note
          </p>
          <p className="mt-2 text-sm text-slate-700">
            {detail.description}
          </p>
          <p className="mt-3 text-xs text-slate-500">
            Submitted {displayDate(detail.createdAt)}
          </p>
        </section>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Info
            title="Customer"
            values={[
              detail.customer.name,
              detail.customer.email || "",
            ]}
          />
          <Info
            title="Order"
            values={[
              "#" + detail.order.orderNumber,
              detail.order.status,
              money(
                detail.order.pricing.totalAmount,
                detail.order.currency
              ),
            ]}
          />
        </div>

        {detail.refund ? (
          <div className="mt-5 rounded-xl bg-green-50 p-4 text-sm text-green-900">
            Refund {detail.refund.id}: {detail.refund.status} ·{" "}
            {money(
              detail.refund.amount,
              detail.order.currency
            )}
            {detail.refund.lastError
              ? " · " + detail.refund.lastError
              : ""}
          </div>
        ) : detail.status === "pending_review" ? (
          <>
            <div className="mt-6">
              <p className="font-bold">Refund amount</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode("full")}
                  className={
                    "rounded-lg px-3 py-2 text-sm font-bold " +
                    (mode === "full"
                      ? "bg-orange-600 text-white"
                      : "bg-slate-100")
                  }
                >
                  Full refund
                </button>
                <button
                  type="button"
                  onClick={() => setMode("partial")}
                  className={
                    "rounded-lg px-3 py-2 text-sm font-bold " +
                    (mode === "partial"
                      ? "bg-orange-600 text-white"
                      : "bg-slate-100")
                  }
                >
                  Partial refund
                </button>
              </div>

              {mode === "partial" && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {Object.entries(detail.order.pricing)
                    .filter(([key]) => key !== "totalAmount")
                    .map(([key, maximum]) => (
                      <label
                        key={key}
                        className="text-xs font-bold capitalize text-slate-600"
                      >
                        {label(key).replace("Amount", "")} (max{" "}
                        {money(maximum, detail.order.currency)})
                        <input
                          type="number"
                          min="0"
                          max={maximum / 100}
                          step="0.01"
                          value={
                            amounts[key as keyof RefundAmounts]
                          }
                          onChange={(event) => setAmounts({
                            ...amounts,
                            [key]: event.target.value,
                          })}
                          className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        />
                      </label>
                    ))}
                </div>
              )}
            </div>

            <label className="mt-5 block text-sm font-bold">
              Admin note (optional for approval; required for rejection)
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={2000}
                rows={3}
                className="mt-2 block w-full rounded-xl border border-slate-200 p-3 text-sm"
              />
            </label>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={working}
                onClick={() => onDecide(
                  "approved",
                  mode,
                  mode === "partial"
                    ? partialAmounts
                    : undefined,
                  note,
                )}
                className="rounded-xl bg-green-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              >
                Approve & queue refund
              </button>
              <button
                type="button"
                disabled={working || !note.trim()}
                onClick={() => onDecide(
                  "rejected",
                  "full",
                  undefined,
                  note,
                )}
                className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-bold text-red-700"
              >
                Reject claim
              </button>
            </div>
          </>
        ) : null}

        {detail.status !== "pending_review" && (
          <section className="mt-5 rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Admin note
            </p>
            <p className="mt-2 text-sm text-slate-700">
              {detail.decision.reason ||
                "No additional note was provided."}
            </p>
            <p className="mt-3 text-xs text-slate-500">
              {detail.status === "approved"
                ? "Approved "
                : "Rejected "}
              {displayDate(detail.decision.decidedAt)}
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

function Info({
  title,
  values,
}: {
  title: string;
  values: string[];
}) {
  return (
    <article className="rounded-xl border border-slate-100 p-4">
      <p className="font-bold">{title}</p>
      {values.filter(Boolean).map((value) => (
        <p
          key={value}
          className="mt-1 text-sm capitalize text-slate-600"
        >
          {value}
        </p>
      ))}
    </article>
  );
}

function Loading() {
  return (
    <div className="mt-6 flex justify-center rounded-2xl bg-white p-12">
      <LoaderCircle className="h-7 w-7 animate-spin text-orange-600" />
    </div>
  );
}
