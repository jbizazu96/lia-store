export interface DriverPayoutReadinessRecord {
  stripeAccountId?: unknown;
  stripeConnectApiVersion?: unknown;
  stripeDetailsSubmitted?: unknown;
  stripeTransfersEnabled?: unknown;
  stripePayoutsEnabled?: unknown;
  stripeRequiresAction?: unknown;
}

export function isDriverPayoutReady(value: DriverPayoutReadinessRecord): boolean {
  return typeof value.stripeAccountId === "string" && value.stripeAccountId.trim().length > 0 &&
    value.stripeConnectApiVersion === "v2" && value.stripeDetailsSubmitted === true &&
    value.stripeTransfersEnabled === true && value.stripePayoutsEnabled === true &&
    value.stripeRequiresAction !== true;
}
