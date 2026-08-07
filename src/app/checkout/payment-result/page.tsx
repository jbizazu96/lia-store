"use client";

import {
  Suspense,
  useEffect,
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

function PaymentResultContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId")?.trim() ?? "";
  const checkoutSessionId = searchParams.get("checkoutSessionId")?.trim() ?? "";
  const {
    loading,
    error,
    failureMessage,
    isConfirmed,
    hasPaymentFailed,
    isProcessing,
  } = useCheckoutPaymentStatus(checkoutSessionId || null);

  useEffect(() => {
    if (isConfirmed && orderId) {
      router.replace(`/orders/${encodeURIComponent(orderId)}`);
    }
  }, [isConfirmed, orderId, router]);

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

  if (loading || isProcessing || isConfirmed) {
    return (
      <ResultCard
        icon={<Clock3 className="h-7 w-7" />}
        title="Confirming your payment"
        message="Please keep this screen open while LIA confirms your order."
        tone="orange"
      />
    );
  }

  if (hasPaymentFailed || error) {
    return (
      <ResultCard
        icon={<AlertCircle className="h-7 w-7" />}
        title="Your payment needs attention"
        message={failureMessage || error || "Your payment was not completed."}
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
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  tone: "orange" | "red" | "green";
}) {
  const classes = {
    orange: "bg-orange-50 text-orange-600",
    red: "bg-red-50 text-red-600",
    green: "bg-green-50 text-green-600",
  }[tone];

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 text-center">
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
