"use client";

import {
  ChevronDown,
  ExternalLink,
  HelpCircle,
  Mail,
  X,
} from "lucide-react";
import {
  useState,
} from "react";

interface DriverHelpCenterModalProps {
  onClose: () => void;
}

const topics = [
  {
    title: "Application and approval",
    body: "Your application remains pending until LIA reviews the required documents and payout setup. You will receive a notification when your status changes.",
  },
  {
    title: "Replacing documents",
    body: "Open Settings, choose the document to replace, then upload the new image and its expiration date. Each replacement is reviewed before it is accepted.",
  },
  {
    title: "Stripe payouts",
    body: "Use Payout account in Settings to connect or update Stripe. Completed delivery earnings are handled through your connected payout account.",
  },
  {
    title: "Delivery radius and availability",
    body: "Your approved radius controls the area LIA may assign to you. Contact support if your location, vehicle, or availability needs to change.",
  },
  {
    title: "Need more help?",
    body: "LIA Support can help with account access, documents, payment setup, or a delivery issue. Include the order number when your question is about a delivery.",
  },
];

export function DriverHelpCenterModal({
  onClose,
}: DriverHelpCenterModalProps) {
  const [openTopic, setOpenTopic] =
    useState<number | null>(0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-slate-950/45 sm:items-center sm:justify-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="driver-help-title"
    >
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <div className="rounded-2xl bg-orange-50 p-3">
              <HelpCircle className="h-6 w-6 text-orange-600" />
            </div>
            <div>
              <p className="text-sm font-bold tracking-wide text-orange-600">
                LIA DRIVER
              </p>
              <h2
                id="driver-help-title"
                className="mt-1 text-2xl font-bold text-slate-950"
              >
                Help Center
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Answers and support for your driver account.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close Driver Help Center"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="mt-6 divide-y divide-slate-100 rounded-2xl border border-slate-100">
          {topics.map((topic, index) => {
            const isOpen = openTopic === index;

            return (
              <div key={topic.title}>
                <button
                  type="button"
                  onClick={() => setOpenTopic(
                    isOpen ? null : index,
                  )}
                  className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left"
                  aria-expanded={isOpen}
                >
                  <span className="font-semibold text-slate-900">
                    {topic.title}
                  </span>
                  <ChevronDown
                    className={
                      "h-5 w-5 shrink-0 text-orange-600 transition " +
                      (isOpen ? "rotate-180" : "")
                    }
                  />
                </button>
                {isOpen && (
                  <p className="px-4 pb-4 text-sm leading-6 text-slate-600">
                    {topic.body}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <a
          href="mailto:support@liamarketplace.com?subject=Driver%20Help%20Request"
          className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-orange-700"
        >
          <Mail className="h-4 w-4" />
          Contact Driver Support
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}
