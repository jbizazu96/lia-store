"use client";

/* Customer-facing order help, intentionally separate from refund claims. */

import {
  useEffect,
  useState,
} from "react";
import {
  Headphones,
  LoaderCircle,
  MessageCircleMore,
} from "lucide-react";
import {
  orderSupportClientService,
  type CustomerOrderSupportRequest,
} from "@/services/order/orderSupportClientService";

const topics = [
  {
    value: "late_delivery",
    label: "Late delivery",
  },
  {
    value: "missing_items",
    label: "Missing items",
  },
  {
    value: "contact_support",
    label: "Contact support",
  },
] as const;

function label(value: string): string {
  return value.replaceAll("_", " ");
}

function date(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime())
    ? null
    : new Intl.DateTimeFormat(
      "en-US",
      {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }
    ).format(parsed);
}

function StatusBadge({
  status,
}: {
  status: string;
}) {
  const className = status === "resolved"
    ? "bg-green-100 text-green-800"
    : status === "open"
      ? "bg-amber-100 text-amber-800"
      : "bg-blue-100 text-blue-800";

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${className}`}>
      {label(status)}
    </span>
  );
}

function Response({
  title,
  icon,
  reply,
}: {
  title: string;
  icon: React.ReactNode;
  reply: CustomerOrderSupportRequest["adminResponse"];
}) {
  if (!reply) {
    return null;
  }

  return (
    <div className="rounded-xl border border-green-100 bg-green-50 p-3">
      <div className="flex items-center gap-2 text-sm font-bold text-green-900">
        {icon}
        {title}
      </div>
      <p className="mt-2 text-sm leading-6 text-green-900">
        {reply.message}
      </p>
      {date(reply.respondedAt) && (
        <p className="mt-2 text-xs text-green-700">
          {date(reply.respondedAt)}
        </p>
      )}
    </div>
  );
}

export function OrderHelpCard({
  orderId,
  embedded = false,
}: {
  orderId: string;
  embedded?: boolean;
}) {
  const [request, setRequest] = useState<CustomerOrderSupportRequest | null>(null);
  const [topic, setTopic] = useState<(typeof topics)[number]["value"]>("late_delivery");
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    void orderSupportClientService
      .getCustomer(orderId)
      .then((result) => {
        if (active) {
          setRequest(result.request);
        }
      })
      .catch((reason) => {
        if (active) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load order support."
          );
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [orderId]);

  const submit = async () => {
    if (!message.trim()) {
      setError("Tell us what happened before sending your request.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await orderSupportClientService.createCustomer({
        orderId,
        reason: topic,
        message: message.trim(),
      });

      const result = await orderSupportClientService.getCustomer(orderId);
      setRequest(result.request);
      setShowForm(false);
      setMessage("");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to send your support request."
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="animate-pulse rounded-2xl border border-gray-100 bg-white/70 p-5 shadow-sm" aria-label="Loading order help options">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-full bg-gray-200" />
          <div className="flex-1 space-y-2"><div className="h-4 w-32 rounded bg-gray-200" /><div className="h-3 w-3/4 rounded bg-gray-100" /></div>
        </div>
      </section>
    );
  }

  if (request) {
    return (
      <section className={embedded ? "" : "rounded-2xl border border-blue-100 bg-white p-5 shadow-sm"}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-blue-50">
              <Headphones className="h-5 w-5 text-blue-700" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Order help request</h3>
              <p className="mt-1 text-sm text-gray-600 capitalize">
                {label(request.reason)}
              </p>
            </div>
          </div>
          <StatusBadge status={request.status} />
        </div>

        <div className="mt-4 rounded-xl bg-gray-50 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Your note</p>
          <p className="mt-1 text-sm leading-6 text-gray-800">{request.message}</p>
          {date(request.createdAt) && <p className="mt-2 text-xs text-gray-500">Sent {date(request.createdAt)}</p>}
        </div>

        <div className="mt-3 space-y-3">
          <Response title="LIA Support response" icon={<MessageCircleMore className="h-4 w-4" />} reply={request.adminResponse} />
        </div>

        {!request.adminResponse && (
          <p className="mt-4 text-sm text-gray-500">
            LIA Support has been notified. We will contact the store as needed and notify you when we reply.
          </p>
        )}
      </section>
    );
  }

  return (
    <section className={embedded ? "" : "rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"}>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-blue-50">
          <Headphones className="h-5 w-5 text-blue-700" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-800">Need help with this order?</h3>
          <p className="mt-1 text-sm leading-6 text-gray-500">
            Report a late delivery, missing items, or contact LIA Support. LIA Support manages the request and will contact the store when needed.
          </p>
        </div>
      </div>

      {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {!showForm ? (
        <button type="button" onClick={() => { setError(""); setShowForm(true); }} className="mt-4 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800">
          Get order help
        </button>
      ) : (
        <div className="mt-4 space-y-3 rounded-xl bg-gray-50 p-4">
          <label className="block text-sm font-semibold text-gray-700">
            What do you need help with?
            <select value={topic} onChange={(event) => setTopic(event.target.value as (typeof topics)[number]["value"])} className="mt-2 block w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800">
              {topics.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold text-gray-700">
            Tell us what happened
            <textarea value={message} maxLength={2000} rows={4} onChange={(event) => setMessage(event.target.value)} className="mt-2 block w-full rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-800" placeholder="Share the details that will help us resolve this." />
          </label>
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={saving} onClick={() => void submit()} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:opacity-60">
              {saving && <LoaderCircle className="h-4 w-4 animate-spin" />}
              Send request
            </button>
            <button type="button" disabled={saving} onClick={() => { setError(""); setShowForm(false); }} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100">Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}
