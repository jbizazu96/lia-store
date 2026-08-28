"use client";

import {useEffect, useMemo, useState} from "react";
import {
  checkoutPaymentClientService,
  type CheckoutTaxEstimate,
  type EstimateCustomerTaxInput,
} from "@/services/payment/checkoutPaymentClientService";

export function useCheckoutTaxEstimate(
  input: EstimateCustomerTaxInput | null,
): {estimate: CheckoutTaxEstimate | null; loading: boolean; error: string | null} {
  const key = useMemo(() => input ? JSON.stringify(input) : "", [input]);
  const [state, setState] = useState<{
    key: string;
    estimate: CheckoutTaxEstimate | null;
    loading: boolean;
    error: string | null;
  }>({key: "", estimate: null, loading: false, error: null});

  useEffect(() => {
    if (!input || !key) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setState({key, estimate: null, loading: true, error: null});
      void checkoutPaymentClientService.estimateCheckoutTax(input)
        .then((estimate) => {
          if (active) setState({key, estimate, loading: false, error: null});
        })
        .catch((reason: unknown) => {
          if (active) setState({
            key,
            estimate: null,
            loading: false,
            error: reason instanceof Error
              ? reason.message
              : "Sales tax could not be estimated right now.",
          });
        });
    }, 350);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [input, key]);

  if (!input || state.key !== key) {
    return {estimate: null, loading: Boolean(input), error: null};
  }
  return {estimate: state.estimate, loading: state.loading, error: state.error};
}
