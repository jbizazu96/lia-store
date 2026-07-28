"use client";

/*
  Store payment and payout settings section.

  This component displays the store's current Stripe Connect status
  and starts Stripe-hosted onboarding.

  Architecture:

  PaymentSection
        ↓
  stripeConnectClientService
        ↓
  Authenticated Next.js API routes
        ↓
  Stripe Connect
*/

import {
  useEffect,
  useRef,
  useState,
} from "react";
import {useSearchParams} from "next/navigation";
import {
  AlertCircle,
  Banknote,
  CheckCircle,
  CircleDollarSign,
  LoaderCircle,
} from "lucide-react";

import {
  isStripeConnectClientError,
  stripeConnectClientService,
} from "@/services/payment/stripeConnectClientService";
import type {
  StripeConnectAccountSummary,
  StripeOnboardingStatus,
} from "@/types/stripeConnect";


/*
  Minimal store information needed by this payment section.

  We intentionally define only the fields used by this component
  instead of accepting `any`.
*/
interface PaymentStoreData {
  /*
    Firestore store document ID.
  */
  id: string;

  /*
    Existing synchronized Stripe fields.

    These fields can be undefined for stores created before Stripe
    Connect was added.
  */
  stripeAccountId?: string;
  stripeAccountStatus?: StripeOnboardingStatus;
  stripeChargesEnabled?: boolean;
  stripeTransfersEnabled?: boolean;
  stripePayoutsEnabled?: boolean;
  stripeDetailsSubmitted?: boolean;
  stripeRequiresAction?: boolean;
  stripeIsReady?: boolean;
}


/*
  Props provided by the store settings page.

  setStoreData allows this component to update the local store state
  after receiving a fresh Stripe account summary.
*/
interface PaymentSectionProps {
  storeData: PaymentStoreData;

  setStoreData: (
    data:
      | PaymentStoreData
      | ((current: PaymentStoreData) => PaymentStoreData)
  ) => void;
}


/*
  UI configuration for each LIA Stripe onboarding status.

  Stripe does not provide one simple account status, so these values
  represent the statuses produced by our account mapper.
*/
const statusConfig: Record<
  StripeOnboardingStatus,
  {
    label: string;
    description: string;
    badgeClassName: string;
    iconClassName: string;
  }
> = {
  not_started: {
    label: "Not connected",
    description:
      "Connect your Stripe account to receive marketplace payouts.",
    badgeClassName: "bg-gray-100 text-gray-700",
    iconClassName: "text-gray-500",
  },

  in_progress: {
    label: "Setup incomplete",
    description:
      "Continue Stripe onboarding to finish your payout setup.",
    badgeClassName: "bg-yellow-100 text-yellow-800",
    iconClassName: "text-yellow-600",
  },

  pending_verification: {
    label: "Under review",
    description:
      "Stripe is reviewing the information you submitted.",
    badgeClassName: "bg-blue-100 text-blue-800",
    iconClassName: "text-blue-600",
  },

  action_required: {
    label: "Action required",
    description:
      "Stripe needs additional information before payouts can begin.",
    badgeClassName: "bg-orange-100 text-orange-800",
    iconClassName: "text-orange-600",
  },

  complete: {
    label: "Ready for payouts",
    description:
      "Your Stripe account is connected and ready to receive earnings.",
    badgeClassName: "bg-green-100 text-green-800",
    iconClassName: "text-green-600",
  },

  restricted: {
    label: "Restricted",
    description:
      "Your Stripe account requires review before it can receive payouts.",
    badgeClassName: "bg-red-100 text-red-800",
    iconClassName: "text-red-600",
  },
};


/*
  Hide most of the Stripe account ID in the UI.

  Example:

  acct_1234567890
        ↓
  acct_••••7890
*/
function maskStripeAccountId(
  accountId: string | undefined
): string {
  if (!accountId) {
    return "Not connected";
  }

  if (accountId.length <= 8) {
    return accountId;
  }

  return `${accountId.slice(0, 5)}••••${accountId.slice(-4)}`;
}


/*
  Convert the browser-safe account summary into the Stripe fields
  stored on the local store state.

  Firestore itself is updated by the server persistence service.
  This update makes the UI react immediately without waiting for a new
  Firestore read.
*/
function applyStripeSummary(
  currentStore: PaymentStoreData,
  account: StripeConnectAccountSummary
): PaymentStoreData {
  return {
    ...currentStore,
    stripeAccountId: account.accountId,
    stripeAccountStatus: account.onboardingStatus,
    stripeChargesEnabled: account.chargesEnabled,
    stripeTransfersEnabled: account.transfersEnabled,
    stripePayoutsEnabled: account.payoutsEnabled,
    stripeDetailsSubmitted: account.detailsSubmitted,
    stripeRequiresAction: account.requiresAction,
    stripeIsReady: account.isReady,
  };
}


export function PaymentSection({
  storeData,
  setStoreData,
}: PaymentSectionProps) {

    /*
    Read Stripe's return state from the settings page URL.

    Supported values:

    stripe=return
      The store owner returned from Stripe-hosted onboarding.

    stripe=refresh
      The Account Link expired or needs to be regenerated.
  */
  const searchParams = useSearchParams();

  /*
    Prevent React development mode or component rerenders from
    processing the same Stripe return more than once.
  */
  const hasHandledStripeReturn = useRef(false);

  /*
    Keep the settings view synchronized when it opens normally, not only
    after Stripe redirects the owner back to LIA.
  */
  const hasLoadedInitialStripeStatus = useRef(false);

  /*
    Prevent repeated Stripe requests while onboarding is being started.
  */
  const [isConnecting, setIsConnecting] =
    useState(false);


  /*
    Separate loading state used while retrieving fresh account status
    after Stripe redirects the store owner back to LIA.
  */
  const [isRefreshingStatus, setIsRefreshingStatus] =
    useState(false);

  /*
    Safe error shown inside the settings page.

    Raw Stripe or Firebase server errors are never displayed here.
  */
  const [connectionError, setConnectionError] =
    useState<string | null>(null);


      /*
    Handle Stripe's redirect back to the settings page.

    A return redirect is not proof that onboarding succeeded.

    We must retrieve the connected account directly from Stripe before
    showing the account as ready.
  */
  useEffect(() => {
    const stripeReturnState =
      searchParams.get("stripe");

    const shouldHandleReturn =
      stripeReturnState === "return" ||
      stripeReturnState === "refresh";

    if (
      !shouldHandleReturn ||
      hasHandledStripeReturn.current ||
      !storeData.id
    ) {
      return;
    }

    hasHandledStripeReturn.current = true;

    async function handleStripeReturn(): Promise<void> {
      setConnectionError(null);

      /*
        An expired or previously used Account Link must be replaced
        with a newly generated link.
      */
      if (stripeReturnState === "refresh") {
        setIsConnecting(true);

        try {
          /*
            Ensure the connected account still exists and synchronize
            its current state before requesting a new Account Link.
          */
          const accountResult =
            await stripeConnectClientService
              .createOrRetrieveAccount(storeData.id);

          setStoreData((currentStore) =>
            applyStripeSummary(
              currentStore,
              accountResult.account
            )
          );

          const onboardingResult =
            await stripeConnectClientService
              .createOnboardingLink(storeData.id);

          window.location.assign(
            onboardingResult.onboarding.url
          );
        } catch (error: unknown) {
          console.error(
            "Unable to refresh Stripe onboarding:",
            error
          );

          if (isStripeConnectClientError(error)) {
            setConnectionError(error.message);
          } else {
            setConnectionError(
              "Stripe onboarding could not be reopened. Please try again."
            );
          }

          setIsConnecting(false);
        }

        return;
      }

      /*
        stripe=return means the store owner left Stripe onboarding.

        Retrieve the latest Stripe status and update both Firestore and
        this component's local state.
      */
      setIsRefreshingStatus(true);

      try {
        const statusResult =
          await stripeConnectClientService
            .getAccountStatus(storeData.id);

        if (statusResult.account) {
          setStoreData((currentStore) =>
            applyStripeSummary(
              currentStore,
              statusResult.account!
            )
          );
        }
      } catch (error: unknown) {
        console.error(
          "Unable to refresh Stripe account status:",
          error
        );

        if (isStripeConnectClientError(error)) {
          setConnectionError(error.message);
        } else {
          setConnectionError(
            "Stripe status could not be refreshed. Please try again."
          );
        }
      } finally {
        setIsRefreshingStatus(false);
      }
    }

    void handleStripeReturn();
  }, [
    searchParams,
    setStoreData,
    storeData.id,
  ]);

  useEffect(() => {
    if (!storeData.id || hasLoadedInitialStripeStatus.current) {
      return;
    }

    hasLoadedInitialStripeStatus.current = true;

    async function refreshInitialStripeStatus(): Promise<void> {
      setIsRefreshingStatus(true);
      setConnectionError(null);

      try {
        const statusResult =
          await stripeConnectClientService.getAccountStatus(storeData.id);

        if (statusResult.account) {
          setStoreData((currentStore) =>
            applyStripeSummary(currentStore, statusResult.account!)
          );
        }
      } catch (error: unknown) {
        console.error("Unable to load Stripe account status:", error);

        if (isStripeConnectClientError(error)) {
          setConnectionError(error.message);
        } else {
          setConnectionError("Stripe account status could not be loaded.");
        }
      } finally {
        setIsRefreshingStatus(false);
      }
    }

    void refreshInitialStripeStatus();
  }, [setStoreData, storeData.id]);

  const status =
    storeData.stripeAccountStatus ?? "not_started";

  const currentStatus = statusConfig[status];

  /*
    Determine the correct button text from the current onboarding state.
  */
  const buttonLabel = (() => {
    if (isConnecting) {
      return "Opening Stripe...";
    }

    switch (status) {
      case "not_started":
        return "Connect Stripe";

      case "in_progress":
      case "action_required":
        return "Continue Setup";

      case "pending_verification":
        return "View Stripe Status";

      case "restricted":
        return "Review Stripe Account";

      case "complete":
        return "Review Stripe Setup";
    }
  })();


  /*
    Create or retrieve the connected account, then request a temporary
    Stripe-hosted onboarding link.

    The browser never receives or uses the Stripe secret key.
  */
  async function handleConnectStripe(): Promise<void> {
    if (isConnecting) {
      return;
    }

    setIsConnecting(true);
    setConnectionError(null);

    try {
      /*
        Step 1:
        Create the Stripe connected account when this store does not
        already have one.

        When an account exists, the backend safely retrieves and
        synchronizes it instead.
      */
      const accountResult =
        await stripeConnectClientService
          .createOrRetrieveAccount(storeData.id);

      /*
        Update the local settings state before redirecting.

        The server has already persisted the same status to Firestore.
      */
      setStoreData((currentStore) =>
        applyStripeSummary(
          currentStore,
          accountResult.account
        )
      );

      /*
        Step 2:
        Create a temporary, single-use Stripe onboarding URL.
      */
      const onboardingResult =
        await stripeConnectClientService
          .createOnboardingLink(storeData.id);

      /*
        Step 3:
        Leave LIA and open Stripe-hosted onboarding.

        Stripe will later return the store owner to the configured
        return URL.
      */
      window.location.assign(
        onboardingResult.onboarding.url
      );
    } catch (error: unknown) {
      console.error(
        "Unable to start Stripe onboarding:",
        error
      );

      if (isStripeConnectClientError(error)) {
        setConnectionError(error.message);
      } else {
        setConnectionError(
          "Stripe onboarding could not be started. Please try again."
        );
      }

      /*
        Only reset the loading state when redirecting did not occur.
      */
      setIsConnecting(false);
    }
  }


  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h3 className="mb-4 font-bold text-gray-800">
          Stripe Connect
        </h3>

        <div className="mb-4 rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-500">
              <Banknote className="h-5 w-5 text-white" />
            </div>

            <div>
              <h4 className="font-semibold text-blue-800">
                Secure payment processing
              </h4>

              <p className="text-sm text-blue-600">
                Stripe securely collects your business, identity,
                banking, and payout information.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Stripe account status
            </label>

            <div
              className={`flex items-center gap-2 rounded-xl px-4 py-3 ${currentStatus.badgeClassName}`}
            >
              {status === "complete" ? (
                <CheckCircle
                  className={`h-4 w-4 ${currentStatus.iconClassName}`}
                />
              ) : (
                <AlertCircle
                  className={`h-4 w-4 ${currentStatus.iconClassName}`}
                />
              )}

               <span className="font-medium">
                {isRefreshingStatus
                  ? "Checking Stripe status..."
                  : currentStatus.label}
              </span>
            </div>

            <p className="mt-2 text-xs text-gray-500">
              {currentStatus.description}
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Account ID
            </label>

            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 font-mono text-sm text-gray-600">
              {maskStripeAccountId(
                storeData.stripeAccountId
              )}
            </div>
          </div>
        </div>

        {storeData.stripeAccountId && (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">
                LIA transfers
              </p>

              <p className="mt-1 text-sm font-semibold text-gray-800">
                {storeData.stripeTransfersEnabled
                  ? "Enabled"
                  : "Not enabled"}
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">
                Bank payouts
              </p>

              <p className="mt-1 text-sm font-semibold text-gray-800">
                {storeData.stripePayoutsEnabled
                  ? "Enabled"
                  : "Not enabled"}
              </p>
            </div>
          </div>
        )}

        {connectionError && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <p>{connectionError}</p>
          </div>
        )}

        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">
                {status === "complete"
                  ? "Your Stripe account is ready."
                  : "Ready to receive marketplace earnings?"}
              </p>

              <p className="text-xs text-gray-500">
                {status === "complete"
                  ? "You can accept customer orders and receive platform payouts."
                  : "Complete Stripe onboarding to receive payouts from LIA."}
              </p>
            </div>

            <button
              type="button"
              onClick={handleConnectStripe}
              disabled={
                isConnecting ||
                isRefreshingStatus
              }
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isConnecting ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <CircleDollarSign className="h-4 w-4" />
              )}

              {buttonLabel}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h3 className="mb-4 font-bold text-gray-800">
          Payout settings
        </h3>

        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm font-medium text-gray-700">
            Payout schedule
          </p>

          <p className="mt-1 text-sm text-gray-500">
            Your payout schedule and bank account are managed securely
            through Stripe.
          </p>

          <p className="mt-3 text-xs text-gray-400">
            LIA will display additional payout controls here after the
            store completes Stripe onboarding.
          </p>
        </div>
      </div>
    </div>
  );
}
