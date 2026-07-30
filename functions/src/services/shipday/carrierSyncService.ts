/*
|--------------------------------------------------------------------------
| Shipday Carrier Sync Service
|--------------------------------------------------------------------------
|
| PURPOSE
| -------
| Synchronizes approved LIA drivers with their Shipday carrier records.
|
| Shipday remains the source of truth for operational driver information:
|
| - Whether the carrier is active
| - Whether the carrier is currently on shift
| - Current latitude
| - Current longitude
| - Carrier profile photo
|
| LIA remains the source of truth for:
|
| - Driver application
| - Driver approval
| - Driver documents
| - Stripe payout setup
|
*/

import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";

import {
  ShipdayCarrierApiResponse,
  shipdayCarrierService,
} from "./carrierService";

/*
|--------------------------------------------------------------------------
| Driver Firestore Shape
|--------------------------------------------------------------------------
|
| This interface contains only the fields needed by this synchronization
| service. It is not intended to represent the complete driver document.
|
*/

interface DriverSyncData {
  isApproved?: boolean;

  email?: string;

  shipday?: {
    carrierId?: number | null;

    connectionStatus?: string;

    isActive?: boolean | null;

    isOnShift?: boolean | null;

    latitude?: number | null;

    longitude?: number | null;

    photoUrl?: string | null;

    operationalStatus?: string;

    syncError?: string | null;
  };
}

/*
|--------------------------------------------------------------------------
| Carrier Helpers
|--------------------------------------------------------------------------
*/

function hasValidCarrierId(
  value: unknown
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0
  );
}

function normalizeNullableString(
  value: string | null
): string | null {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const normalized =
    value.trim();

  return normalized || null;
}

/*
|--------------------------------------------------------------------------
| Operational Status
|--------------------------------------------------------------------------
|
| This status is derived from Shipday. It must not be manually controlled
| by the LIA driver application.
|
| Rules:
|
| inactive:
|   Shipday has disabled the carrier.
|
| offline:
|   Carrier is active but not currently on shift.
|
| online:
|   Carrier is active and currently on shift.
|
*/

function getCarrierOperationalStatus(
  carrier: ShipdayCarrierApiResponse
): "inactive" | "offline" | "online" {
  if (!carrier.isActive) {
    return "inactive";
  }

  if (!carrier.isOnShift) {
    return "offline";
  }

  return "online";
}

/*
|--------------------------------------------------------------------------
| Change Detection
|--------------------------------------------------------------------------
|
| Avoid unnecessary Firestore writes when Shipday returned the same data.
|
*/

function carrierDataChanged(
  driver: DriverSyncData,
  carrier: ShipdayCarrierApiResponse
): boolean {
  const current =
    driver.shipday;

  const photoUrl =
    normalizeNullableString(
      carrier.carrierPhoto
    );

  const operationalStatus =
    getCarrierOperationalStatus(
      carrier
    );

  return (
    current?.connectionStatus !==
      "connected" ||

    current?.isActive !==
      carrier.isActive ||

    current?.isOnShift !==
      carrier.isOnShift ||

    current?.latitude !==
      carrier.carrrierLocationLat ||

    current?.longitude !==
      carrier.carrrierLocationLng ||

    current?.photoUrl !==
      photoUrl ||

    current?.operationalStatus !==
      operationalStatus ||

    current?.syncError != null
  );
}

/*
|--------------------------------------------------------------------------
| Carrier Sync Service
|--------------------------------------------------------------------------
*/

export class CarrierSyncService {
  /*
  |--------------------------------------------------------------------------
  | Firestore
  |--------------------------------------------------------------------------
  */

  private get db() {
    return getFirestore("default");
  }

  /*
  |--------------------------------------------------------------------------
  | Synchronize Approved Drivers
  |--------------------------------------------------------------------------
  |
  | Shipday carriers are retrieved once per scheduled run.
  |
  | We then load approved drivers and match them locally using carrierId.
  |
  */

  async syncApprovedDrivers(): Promise<void> {
    console.log(
      "Starting Shipday carrier synchronization..."
    );

    /*
     * Step 1:
     * Retrieve the latest carrier list from Shipday.
     */
    const carriers =
      await shipdayCarrierService
        .retrieveCarriers();

    console.log(
      `Retrieved ${carriers.length} Shipday carriers.`
    );

    /*
     * Build a map so carrier lookup is constant-time.
     */
    const carriersById =
      new Map<
        number,
        ShipdayCarrierApiResponse
      >();

    for (const carrier of carriers) {
      carriersById.set(
        carrier.id,
        carrier
      );
    }

    /*
     * Step 2:
     * Load approved LIA drivers.
     *
     * We query by approval first and filter carrier IDs in memory. This keeps
     * the query simple and avoids relying on an additional composite index.
     */
    const driverSnapshot =
      await this.db
        .collection("drivers")
        .where(
          "isApproved",
          "==",
          true
        )
        .get();

    const connectedDriverDocuments =
      driverSnapshot.docs.filter(
        (document) => {
          const driver =
            document.data() as
              DriverSyncData;

          return hasValidCarrierId(
            driver.shipday
              ?.carrierId
          );
        }
      );

    console.log(
      `Found ${connectedDriverDocuments.length} approved drivers with Shipday carrier IDs.`
    );

    /*
     * Step 3:
     * Synchronize each connected driver independently.
     *
     * One malformed or missing Shipday carrier must not stop all remaining
     * drivers from synchronizing.
     */
    let synchronizedCount = 0;
    let unchangedCount = 0;
    let failedCount = 0;

    for (
      const document of
      connectedDriverDocuments
    ) {
      try {
        const result =
          await this.syncDriverFromCarrierMap(
            document.id,
            carriersById
          );

        if (result === "updated") {
          synchronizedCount++;
        } else {
          unchangedCount++;
        }
      } catch (error) {
        failedCount++;

        console.error(
          "Unable to synchronize Shipday carrier; continuing with remaining drivers.",
          {
            driverId:
              document.id,

            error,
          }
        );
      }
    }

    console.log(
      "Shipday carrier synchronization complete.",
      {
        synchronizedCount,
        unchangedCount,
        failedCount,
      }
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Synchronize One Driver
  |--------------------------------------------------------------------------
  */

  private async syncDriverFromCarrierMap(
    driverId: string,
    carriersById: ReadonlyMap<
      number,
      ShipdayCarrierApiResponse
    >
  ): Promise<"updated" | "unchanged"> {
    console.log(
      `Synchronizing Shipday carrier for driver ${driverId}.`
    );

    /*
     * Reload the driver so we do not rely on stale query data.
     */
    const driverDocument =
      await this.db
        .collection("drivers")
        .doc(driverId)
        .get();

    if (!driverDocument.exists) {
      throw new Error(
        "Driver document was not found."
      );
    }

    const driver =
      driverDocument.data() as
        DriverSyncData;

    /*
     * Approval may have been revoked since the original query.
     */
    if (
      driver.isApproved !== true
    ) {
      console.log(
        "Driver is no longer approved. Carrier synchronization skipped."
      );

      return "unchanged";
    }

    const carrierId =
      driver.shipday
        ?.carrierId;

    if (
      !hasValidCarrierId(
        carrierId
      )
    ) {
      console.log(
        "Driver has no valid Shipday carrier ID."
      );

      return "unchanged";
    }

    const carrier =
      carriersById.get(
        carrierId
      );

    /*
     * A missing carrier can indicate that it was deleted or removed from
     * Shipday. Record this condition for the admin portal without removing
     * the saved carrier ID automatically.
     */
    if (!carrier) {
      await driverDocument.ref.update({
        "shipday.connectionStatus":
          "failed",

        "shipday.operationalStatus":
          "shipday_setup_required",

        "shipday.isActive":
          null,

        "shipday.isOnShift":
          null,

        "shipday.latitude":
          null,

        "shipday.longitude":
          null,

        "shipday.syncError":
          `Shipday carrier ${carrierId} was not found.`,

        "shipday.lastSyncAttemptAt":
          FieldValue.serverTimestamp(),

        "shipday.lastFailedAt":
          FieldValue.serverTimestamp(),

        updatedAt:
          FieldValue.serverTimestamp(),
      });

      throw new Error(
        `Shipday carrier ${carrierId} was not found.`
      );
    }

    /*
     * Avoid writing when no operational data changed.
     *
     * We still do not update lastSyncedAt here because doing so would create
     * a Firestore write every two minutes even when nothing changed.
     */
    if (
      !carrierDataChanged(
        driver,
        carrier
      )
    ) {
      console.log(
        "Driver carrier data is already synchronized."
      );

      return "unchanged";
    }

    const operationalStatus =
      getCarrierOperationalStatus(
        carrier
      );

    await driverDocument.ref.update({
      "shipday.connectionStatus":
        "connected",

      "shipday.carrierEmail":
        carrier.email.trim()
          .toLowerCase(),

      "shipday.isActive":
        carrier.isActive,

      "shipday.isOnShift":
        carrier.isOnShift,

      "shipday.latitude":
        carrier.carrrierLocationLat,

      "shipday.longitude":
        carrier.carrrierLocationLng,

      "shipday.photoUrl":
        normalizeNullableString(
          carrier.carrierPhoto
        ),

      "shipday.operationalStatus":
        operationalStatus,

      "shipday.syncError":
        null,

      "shipday.lastSyncedAt":
        FieldValue.serverTimestamp(),

      "shipday.lastSyncAttemptAt":
        FieldValue.serverTimestamp(),

      updatedAt:
        FieldValue.serverTimestamp(),
    });

    console.log(
      "Driver Shipday carrier synchronized.",
      {
        driverId,
        carrierId,
        operationalStatus,
        isActive:
          carrier.isActive,
        isOnShift:
          carrier.isOnShift,
      }
    );

    return "updated";
  }
}

/*
|--------------------------------------------------------------------------
| Shared Service
|--------------------------------------------------------------------------
*/

export const carrierSyncService =
  new CarrierSyncService();