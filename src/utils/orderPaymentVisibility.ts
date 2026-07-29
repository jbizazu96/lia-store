/*
 * Customer and store order views must not expose a checkout-created order
 * until the verified Stripe webhook has completed both payment updates.
 */
export function isPaidConfirmedOrder(
  value: unknown
): boolean {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return false;
  }

  const order =
    value as Record<string, unknown>;

  const payment =
    order.payment &&
    typeof order.payment === "object"
      ? order.payment as Record<string, unknown>
      : null;

  return (
    order.checkoutStatus === "confirmed" &&
    payment?.status === "paid"
  );
}
