"use client";

import {
  useEffect,
  useState,
} from "react";
import {
  BadgeCheck,
  ImageIcon,
  PenLine,
} from "lucide-react";
import {
  customerDeliveryProofClientService,
  type CustomerDeliveryProof,
} from "@/services/order/customerDeliveryProofClientService";

interface DeliveryProofCardProps {
  orderId: string;
}

export function DeliveryProofCard({
  orderId,
}: DeliveryProofCardProps) {
  const [proof, setProof] =
    useState<CustomerDeliveryProof | null>(null);

  useEffect(() => {
    let active = true;

    void customerDeliveryProofClientService
      .get(orderId)
      .then((result) => {
        if (active) {
          setProof(result);
        }
      })
      .catch(() => {
        /*
         * Proof availability must never prevent the customer from viewing
         * their completed order. The next page visit can request a fresh
         * short-lived URL.
         */
      });

    return () => {
      active = false;
    };
  }, [orderId]);

  if (
    !proof ||
    (!proof.signatureUrl &&
      proof.imageUrls.length === 0)
  ) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm">
      <div className="flex items-start gap-3 border-b border-emerald-100 bg-emerald-50 px-5 py-4">
        <div className="rounded-xl bg-white p-2.5 shadow-sm">
          <BadgeCheck className="h-5 w-5 text-emerald-600" />
        </div>
        <div>
          <p className="text-sm font-bold text-emerald-950">
            Delivery proof
          </p>
          <p className="mt-1 text-sm leading-5 text-emerald-800">
            Captured by your delivery driver when this order was completed.
          </p>
        </div>
      </div>

      <div className="space-y-5 p-5">
        {proof.signatureUrl && (
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-800">
              <PenLine className="h-4 w-4 text-orange-500" />
              Delivery signature
            </div>
            <a
              href={proof.signatureUrl}
              target="_blank"
              rel="noreferrer"
              className="block overflow-hidden rounded-xl border border-gray-100 bg-gray-50 transition hover:border-orange-200"
              aria-label="Open delivery signature"
            >
              <img
                src={proof.signatureUrl}
                alt="Delivery signature"
                className="h-36 w-full object-contain p-3"
              />
            </a>
          </div>
        )}

        {proof.imageUrls.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-800">
              <ImageIcon className="h-4 w-4 text-orange-500" />
              Delivery photo{proof.imageUrls.length === 1 ? "" : "s"}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {proof.imageUrls.map((url, index) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="overflow-hidden rounded-xl border border-gray-100 bg-gray-50 transition hover:border-orange-200"
                  aria-label={`Open delivery photo ${index + 1}`}
                >
                  <img
                    src={url}
                    alt={`Delivery proof photo ${index + 1}`}
                    className="aspect-square w-full object-cover"
                  />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
