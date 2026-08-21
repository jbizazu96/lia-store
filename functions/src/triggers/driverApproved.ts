/*
|--------------------------------------------------------------------------
| Driver Approved Trigger
|--------------------------------------------------------------------------
|
| Creates or reconnects a Shipday carrier when a LIA administrator changes
| a driver from unapproved to approved.
|
| Trigger condition:
|
|   before.isApproved !== true
|   after.isApproved === true
|
| This function is intentionally server-side because the Shipday API key
| must never be exposed to browser code.
|
*/

import {
  defineSecret,
} from "firebase-functions/params";

import {
  onDocumentUpdated,
} from "firebase-functions/v2/firestore";
import {
  logger,
} from "firebase-functions";
import {
  FieldValue,
  Timestamp,
  getFirestore,
} from "firebase-admin/firestore";
import {
  randomUUID,
} from "node:crypto";
import {
  shipdayCarrierService,
} from "../services/shipday/carrierService";
import {enqueueEmail} from "../email/emailQueueService";
import {driverShipdayCredentialsEmail} from "../email/emailTemplates";

/*
|--------------------------------------------------------------------------
| Configuration
|--------------------------------------------------------------------------
|
| A short lease prevents two simultaneous function invocations from creating
| the same carrier.
|
| If a function process stops unexpectedly after claiming the work, a later
| retry can reclaim it after the lease expires.
|
*/

const SHIPDAY_API_KEY =
  defineSecret("SHIPDAY_API_KEY");
const PROVISIONING_LEASE_MILLISECONDS =
  5 * 60 * 1000;

/*
|--------------------------------------------------------------------------
| Driver Data Helpers
|--------------------------------------------------------------------------
*/

interface DriverApprovalData {
  isApproved?: boolean;
  onboardingCompleted?: boolean;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  email?: string;
  phone?: string;

  shipday?: {
    carrierId?: number | null;
    connectionStatus?: string;
    provisioningLeaseUntil?: Timestamp | null;
    provisioningToken?: string | null;
  };
}

function requiredString(
  value: unknown,
  fieldName: string
): string {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new Error(
      `${fieldName} is required before creating a Shipday carrier.`
    );
  }

  return value.trim();
}

function buildDriverName(
  driver: DriverApprovalData
): string {
  const firstName = requiredString(
    driver.firstName,
    "Driver first name"
  );

  const lastName = requiredString(
    driver.lastName,
    "Driver last name"
  );

  const middleName =
    typeof driver.middleName === "string"
      ? driver.middleName.trim()
      : "";

  return [
    firstName,
    middleName,
    lastName,
  ]
    .filter(Boolean)
    .join(" ");
}

function hasCarrierId(
  value: unknown
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0
  );
}

/*
|--------------------------------------------------------------------------
| Provisioning Claim
|--------------------------------------------------------------------------
|
| Firestore triggers are delivered at least once. The same approval event can
| therefore run more than once.
|
| This transaction gives one invocation a temporary lease. Other concurrent
| invocations stop unless the previous lease has expired.
|
*/

async function claimCarrierProvisioning(
  driverId: string,
  provisioningToken: string
): Promise<boolean> {
  const db = getFirestore("default");
  const driverReference =
    db.collection("drivers").doc(driverId);

  return db.runTransaction(
    async (transaction) => {
      const snapshot =
        await transaction.get(driverReference);

      if (!snapshot.exists) {
        return false;
      }

      const driver =
        snapshot.data() as DriverApprovalData;

      /*
       * Approval may have been revoked before this function acquired the
       * provisioning lease.
       */
      if (driver.isApproved !== true) {
        return false;
      }

      /*
       * The driver is already connected. Never create another carrier.
       */
      if (
        hasCarrierId(
          driver.shipday?.carrierId
        )
      ) {
        return false;
      }

      const currentLease =
        driver.shipday
          ?.provisioningLeaseUntil;

      const leaseIsActive =
        currentLease instanceof Timestamp &&
        currentLease.toMillis() >
          Date.now();

      if (
        driver.shipday
          ?.connectionStatus ===
          "creating" &&
        leaseIsActive
      ) {
        return false;
      }

      transaction.update(
        driverReference,
        {
          "shipday.connectionStatus":
            "creating",

          "shipday.provisioningToken":
            provisioningToken,

          "shipday.provisioningLeaseUntil":
            Timestamp.fromMillis(
              Date.now() +
                PROVISIONING_LEASE_MILLISECONDS
            ),

          "shipday.lastAttemptAt":
            FieldValue.serverTimestamp(),

          "shipday.syncError":
            null,

          updatedAt:
            FieldValue.serverTimestamp(),
        }
      );

      return true;
    }
  );
}

/*
|--------------------------------------------------------------------------
| Save Successful Connection
|--------------------------------------------------------------------------
*/

async function saveCarrierConnection(input: {
  driverId: string;
  provisioningToken: string;
  carrierId: number;
  carrierEmail: string;
  wasCreated: boolean;
}): Promise<void> {
  const db = getFirestore("default");
  const driverReference =
    db.collection("drivers").doc(
      input.driverId
    );

  await db.runTransaction(
    async (transaction) => {
      const snapshot =
        await transaction.get(
          driverReference
        );

      if (!snapshot.exists) {
        throw new Error(
          "Driver document disappeared while saving the Shipday carrier."
        );
      }

      const driver =
        snapshot.data() as DriverApprovalData;

      /*
       * Only the invocation holding the current lease may finish this
       * provisioning attempt.
       */
      if (
        driver.shipday
          ?.provisioningToken !==
        input.provisioningToken
      ) {
        throw new Error(
          "Shipday carrier provisioning lease is no longer owned by this invocation."
        );
      }

      transaction.update(
        driverReference,
        {
          "shipday.carrierId":
            input.carrierId,

          "shipday.carrierEmail":
            input.carrierEmail,

          "shipday.connectionStatus":
            "connected",

          "shipday.wasCreatedByLia":
            input.wasCreated,

          /*
           * Shipday is now authoritative for active and on-shift states.
           * The next carrier synchronization will populate these values.
           */
          "shipday.isActive":
            null,

          "shipday.isOnShift":
            null,

          "shipday.latitude":
            null,

          "shipday.longitude":
            null,

          "shipday.connectedAt":
            FieldValue.serverTimestamp(),

          "shipday.lastSyncedAt":
            null,

          "shipday.syncError":
            null,

          "shipday.provisioningToken":
            null,

          "shipday.provisioningLeaseUntil":
            null,

          /*
           * Shipday may return a generated password for a newly created
           * carrier. It is deliberately not stored in Firestore.
           *
           * A later secure notification workflow will deliver or reset the
           * carrier credentials.
           */
          "shipday.credentialsStatus":
            input.wasCreated
              ? "delivered_by_email"
              : "existing_carrier",

          updatedAt:
            FieldValue.serverTimestamp(),
        }
      );
    }
  );
}

/*
|--------------------------------------------------------------------------
| Save Provisioning Failure
|--------------------------------------------------------------------------
*/

async function saveCarrierFailure(input: {
  driverId: string;
  provisioningToken: string;
  errorMessage: string;
}): Promise<void> {
  const db = getFirestore("default");
  const driverReference =
    db.collection("drivers").doc(
      input.driverId
    );

  await db.runTransaction(
    async (transaction) => {
      const snapshot =
        await transaction.get(
          driverReference
        );

      if (!snapshot.exists) {
        return;
      }

      const driver =
        snapshot.data() as DriverApprovalData;

      /*
       * Do not overwrite the result of a newer provisioning attempt.
       */
      if (
        driver.shipday
          ?.provisioningToken !==
        input.provisioningToken
      ) {
        return;
      }

      transaction.update(
        driverReference,
        {
          "shipday.connectionStatus":
            "failed",

          "shipday.syncError":
            input.errorMessage,

          "shipday.provisioningToken":
            null,

          "shipday.provisioningLeaseUntil":
            null,

          "shipday.lastFailedAt":
            FieldValue.serverTimestamp(),

          updatedAt:
            FieldValue.serverTimestamp(),
        }
      );
    }
  );
}

/*
|--------------------------------------------------------------------------
| Firestore Trigger
|--------------------------------------------------------------------------
*/

export const driverApproved =
  onDocumentUpdated(
    {
      document:
        "drivers/{driverId}",

      database:
        "default",

      region:
        "us-central1",

      retry: true,

      secrets: [
        SHIPDAY_API_KEY,
      ],
    },
    async (event) => {
      const beforeSnapshot =
        event.data?.before;

      const afterSnapshot =
        event.data?.after;

      if (
        !beforeSnapshot ||
        !afterSnapshot
      ) {
        return;
      }

      const before =
        beforeSnapshot.data() as
          DriverApprovalData;

      const after =
        afterSnapshot.data() as
          DriverApprovalData;

      /*
       * Run only when approval changes from anything other than true to true.
       */
      const becameApproved =
        before.isApproved !== true &&
        after.isApproved === true;

      if (!becameApproved) {
        return;
      }

      const driverId =
        event.params.driverId;

      /*
       * Defensive duplicate check before acquiring the transactional lease.
       */
      if (
        hasCarrierId(
          after.shipday?.carrierId
        )
      ) {
        logger.info(
          "Approved driver already has a Shipday carrier.",
          {
            driverId,
            carrierId:
              after.shipday?.carrierId,
          }
        );

        return;
      }

      const provisioningToken =
        randomUUID();

      const claimed =
        await claimCarrierProvisioning(
          driverId,
          provisioningToken
        );

      if (!claimed) {
        logger.info(
          "Shipday carrier provisioning was already completed or claimed.",
          {
            driverId,
          }
        );

        return;
      }

      try {
        const name =
          buildDriverName(after);

        const email =
          requiredString(
            after.email,
            "Driver email"
          ).toLowerCase();

        const phoneNumber =
          requiredString(
            after.phone,
            "Driver phone number"
          );

        /* Do not create an account with a one-time password when LIA cannot
         * deliver that credential. Admin can resolve the suppression and
         * reapprove, without leaving an inaccessible Shipday carrier. */
        const emailSuppression = await getFirestore("default")
          .collection("emailSuppressions")
          .doc(email)
          .get();
        if (emailSuppression.exists) {
          throw new Error("The driver email is suppressed; Shipday credentials cannot be delivered.");
        }

        const carrier =
          await shipdayCarrierService
            .findOrCreateCarrier({
              name,
              email,
              phoneNumber,
            });

        if (carrier.wasCreated && carrier.password) {
          const template = driverShipdayCredentialsEmail({
            driverName: name,
            email: carrier.email || email,
            temporaryPassword: carrier.password,
          });
          await enqueueEmail({
            dedupeKey: `driver-shipday-credentials:${driverId}:${carrier.carrierId}`,
            category: "driver_shipday_credentials",
            to: email,
            ...template,
            tags: {driver_id: driverId, shipday_carrier_id: String(carrier.carrierId)},
          });
        }

        await saveCarrierConnection({
          driverId,
          provisioningToken,
          carrierId:
            carrier.carrierId,
          carrierEmail:
            carrier.email || email,
          wasCreated:
            carrier.wasCreated,
        });

        /*
         * Never include the generated Shipday password in logs.
         */
        logger.info(
          "Shipday carrier connected to approved LIA driver.",
          {
            driverId,
            carrierId:
              carrier.carrierId,
            wasCreated:
              carrier.wasCreated,
          }
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Unknown Shipday carrier provisioning error.";

        await saveCarrierFailure({
          driverId,
          provisioningToken,
          errorMessage,
        });

        logger.error(
          "Failed to connect approved driver to Shipday.",
          {
            driverId,
            errorMessage,
          }
        );

        /*
         * Rethrow so Firebase can retry temporary Shipday or network errors.
         */
        throw error;
      }
    }
  );
