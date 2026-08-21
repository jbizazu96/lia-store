"use client";

import {
  Suspense,
  useEffect,
  useState,
} from "react";
import {
  useRouter,
  useSearchParams,
} from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
} from "lucide-react";
import {
  BrandedLoader,
} from "@/components/ui/BrandedLoader";
import {
  useCheckoutPaymentStatus,
} from "@/hooks/useCheckoutPaymentStatus";
import {reportClientIssue} from "@/services/monitoring/clientErrorReporter";

const PAYMENT_CONFIRMATION_TIMEOUT_MS = 90_000;

function PaymentResultContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId")?.trim() ?? "";
  const checkoutSessionId = searchParams.get("checkoutSessionId")?.trim() ?? "";
  const [retrySignal, setRetrySignal] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const {
    loading,
    error,
    failureMessage,
    isConfirmed,
    hasPaymentFailed,
    isProcessing,
    isAwaitingPayment,
  } = useCheckoutPaymentStatus(checkoutSessionId || null, retrySignal);

  useEffect(() => {
    if (isConfirmed && orderId) {
      router.replace(`/orders/${encodeURIComponent(orderId)}`);
    }
  }, [isConfirmed, orderId, router]);

  useEffect(() => {
    if (!orderId || !checkoutSessionId || isConfirmed || hasPaymentFailed) {
      return;
    }

    const timer = window.setTimeout(() => {
      setTimedOut(true);
      reportClientIssue({
        area: "checkout.payment_confirmation_timeout",
        message: "Payment confirmation exceeded the customer wait limit",
        severity: "warning",
        metadata: {checkoutStatus: "pending_or_processing"},
      });
    }, PAYMENT_CONFIRMATION_TIMEOUT_MS);

    return () => window.clearTimeout(timer);
  }, [checkoutSessionId, hasPaymentFailed, isConfirmed, orderId, retrySignal]);

  const retryVerification = () => {
    setTimedOut(false);
    setRetrySignal((current) => current + 1);
  };

  const uncertainPaymentActions = (
    <div className="mt-6 grid gap-2.5">
      <button
        type="button"
        onClick={retryVerification}
        className="min-h-11 rounded-full bg-orange-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-orange-600"
      >
        Retry verification
      </button>
      <button
        type="button"
        onClick={() => router.push("/orders")}
        className="min-h-11 rounded-full border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-800 transition hover:bg-gray-50"
      >
        Check order status
      </button>
      <button
        type="button"
        onClick={() => router.push(`/help?from=payment&orderId=${encodeURIComponent(orderId)}`)}
        className="min-h-11 rounded-full px-4 py-2.5 text-sm font-bold text-orange-600 transition hover:bg-orange-50"
      >
        Contact LIA Support
      </button>
    </div>
  );

  if (!orderId || !checkoutSessionId) {
    return (
      <ResultCard
        icon={<AlertCircle className="h-7 w-7" />}
        title="We couldn&apos;t resume this payment"
        message="Return to your cart and try checkout again."
        actionLabel="Return to cart"
        onAction={() => router.replace("/cart")}
        tone="orange"
      />
    );
  }

  if (timedOut || error) {
    return (
      <ResultCard
        icon={<AlertCircle className="h-7 w-7" />}
        title={error ? "We couldn’t verify your payment status" : "Confirmation is taking longer than expected"}
        message="Your payment may still be processing. Do not submit another payment until its status is known. Retry verification, check your orders, or contact LIA Support."
        tone="orange"
        actions={uncertainPaymentActions}
      />
    );
  }

  if (loading || isProcessing || isAwaitingPayment || isConfirmed) {
    return (
      <ResultCard
        icon={<Clock3 className="h-7 w-7" />}
        title="Confirming your payment"
        message="Please keep this screen open while LIA confirms your order. Do not submit another payment while confirmation is in progress."
        tone="orange"
      />
    );
  }

  if (hasPaymentFailed) {
    return (
      <ResultCard
        icon={<AlertCircle className="h-7 w-7" />}
        title="Your payment needs attention"
        message={failureMessage || "Your payment was not completed."}
        actionLabel="Return to cart"
        onAction={() => router.replace("/cart")}
        tone="red"
      />
    );
  }

  return (
    <ResultCard
      icon={<CheckCircle2 className="h-7 w-7" />}
      title="Payment received"
      message="LIA is finishing your order. This usually takes only a moment."
      tone="green"
    />
  );
}

function ResultCard({
  icon,
  title,
  message,
  actionLabel,
  onAction,
  actions,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  actions?: React.ReactNode;
  tone: "orange" | "red" | "green";
}) {
  const classes = {
    orange: "bg-orange-50 text-orange-600",
    red: "bg-red-50 text-red-600",
    green: "bg-green-50 text-green-600",
  }[tone];

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 text-center">
      <section className="max-w-sm rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${classes}`}>
          {icon}
        </div>
        <h1 className="mt-5 text-xl font-bold text-gray-900">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">{message}</p>
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="mt-6 min-h-11 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-orange-600"
          >
            {actionLabel}
          </button>
        )}
        {actions}
      </section>
    </main>
  );
}

export default function PaymentResultPage() {
  return (
    <Suspense fallback={<BrandedLoader message="Checking payment" />}>
      <PaymentResultContent />
    </Suspense>
  );
}
