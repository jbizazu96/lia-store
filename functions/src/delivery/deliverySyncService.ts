/*
|--------------------------------------------------------------------------
| Delivery Sync Service
|--------------------------------------------------------------------------
|
| PURPOSE
| -------
| Keeps LIA synchronized with external delivery providers.
|
| During development, LIA polls Shipday for delivery updates.
|
| Later, the same synchronization layer can receive updates from:
|
| • Shipday webhooks
| • Uber Direct
| • DoorDash Drive
| • Roadie
|
| The rest of the application does not need to know which provider
| supplied the update.
|
*/

import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";
import {
  getStorage,
} from "firebase-admin/storage";

import {
  mapShipdayStatus,
} from "../mappers/shipdayStatusMapper";

import {
  shipdayService,
} from "../services/shipdayService";
import {isAccountDeletionRestricted} from "../accountDeletion/accountDeletionAccessService";


/*
|--------------------------------------------------------------------------
| Shipday Order Shape
|--------------------------------------------------------------------------
|
| Shipday is an external API, so getOrderDetails() returns unknown.
|
| This interface describes only the fields this synchronization service
| currently needs.
|
*/

interface ShipdayAssignedCarrier {
  id: number;

  name?: string | null;

  email?: string | null;
}

interface ShipdayOrderDetails {
  assignedCarrier?: ShipdayAssignedCarrier | null;

  assignedCarrierId?: number | null;

  orderStatus: {
    orderState: string;
  };

  proofOfDelivery?: {
    signaturePath?: string | null;
    imageUrls?: unknown;
  } | null;

  [key: string]: unknown;
}

interface DeliveryProofFile {
  storagePath: string;
  contentType: string;
}

interface DeliveryProof {
  signature: DeliveryProofFile | null;
  images: DeliveryProofFile[];
}

const MAXIMUM_PROOF_FILE_BYTES =
  10 * 1024 * 1024;

function text(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function shipdayProofUrls(
  proof: ShipdayOrderDetails["proofOfDelivery"],
): {
  signatureUrl: string | null;
  imageUrls: string[];
} {
  const signatureUrl = text(proof?.signaturePath) || null;
  const candidateImageUrls = proof?.imageUrls;
  const imageUrls = Array.isArray(candidateImageUrls)
    ? candidateImageUrls
      .map(text)
      .filter(Boolean)
    : [];

  return {
    signatureUrl,
    imageUrls,
  };
}

function isSafeShipdayProofUrl(
  value: string,
): boolean {
  try {
    const url = new URL(value);

    /*
     * Shipday currently returns its proof files from Amazon S3. Do not let
     * an external provider response turn this server into a general-purpose
     * URL fetcher.
     */
    return url.protocol === "https:" &&
      url.hostname.endsWith("amazonaws.com");
  } catch {
    return false;
  }
}

function extensionForContentType(
  contentType: string,
): string {
  if (contentType === "image/png") {
    return "png";
  }

  if (contentType === "image/webp") {
    return "webp";
  }

  return "jpg";
}

async function copyShipdayProofFile(
  sourceUrl: string,
  destinationBasePath: string,
): Promise<DeliveryProofFile> {
  if (!isSafeShipdayProofUrl(sourceUrl)) {
    throw new Error("Shipday returned an unsupported proof URL.");
  }

  const response = await fetch(sourceUrl);

  if (!response.ok) {
    throw new Error(
      `Unable to download Shipday delivery proof (${response.status}).`,
    );
  }

  const contentType = text(
    response.headers.get("content-type"),
  ).toLowerCase().split(";")[0];

  if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
    throw new Error("Shipday delivery proof is not a supported image.");
  }

  const contentLength = Number(
    response.headers.get("content-length") ?? 0,
  );

  if (
    Number.isFinite(contentLength) &&
    contentLength > MAXIMUM_PROOF_FILE_BYTES
  ) {
    throw new Error("Shipday delivery proof exceeds the file-size limit.");
  }

  const bytes = Buffer.from(
    await response.arrayBuffer(),
  );

  if (
    bytes.length === 0 ||
    bytes.length > MAXIMUM_PROOF_FILE_BYTES
  ) {
    throw new Error("Shipday delivery proof has an invalid file size.");
  }

  const destinationPath =
    `${destinationBasePath}.${extensionForContentType(contentType)}`;

  await getStorage()
    .bucket()
    .file(destinationPath)
    .save(bytes, {
      metadata: {
        contentType,
        cacheControl: "private, no-store",
      },
    });

  return {
    storagePath: destinationPath,
    contentType,
  };
}

async function synchronizeDeliveryProof(
  orderId: string,
  shipdayOrder: ShipdayOrderDetails,
  existingProof: unknown,
): Promise<DeliveryProof | null> {
  const source = shipdayProofUrls(
    shipdayOrder.proofOfDelivery,
  );

  if (!source.signatureUrl && source.imageUrls.length === 0) {
    return null;
  }

  const previous = existingProof &&
    typeof existingProof === "object"
    ? existingProof as {
      signature?: DeliveryProofFile | null;
      images?: DeliveryProofFile[];
    }
    : {};
  const currentImages = Array.isArray(previous.images)
    ? previous.images.filter((image) =>
      typeof image?.storagePath === "string" &&
      typeof image?.contentType === "string",
    )
    : [];
  let signature = previous.signature &&
    typeof previous.signature.storagePath === "string" &&
    typeof previous.signature.contentType === "string"
    ? previous.signature
    : null;

  if (source.signatureUrl && !signature) {
    signature = await copyShipdayProofFile(
      source.signatureUrl,
      `orders/${orderId}/delivery-proof/signature`,
    );
  }

  const images = [...currentImages];

  for (
    let index = currentImages.length;
    index < source.imageUrls.length;
    index += 1
  ) {
    const sourceUrl = source.imageUrls[index];
    const image = await copyShipdayProofFile(
      sourceUrl,
      `orders/${orderId}/delivery-proof/photo-${index + 1}`,
    );
    images.push(image);
  }

  return {
    signature,
    images,
  };
}


/*
|--------------------------------------------------------------------------
| Shipday Response Guard
|--------------------------------------------------------------------------
*/

function isShipdayOrderDetails(
  value: unknown
): value is ShipdayOrderDetails {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    return false;
  }

  const candidate =
    value as {
      orderStatus?: unknown;
    };

  if (
    typeof candidate.orderStatus !==
      "object" ||
    candidate.orderStatus === null
  ) {
    return false;
  }

  const orderStatus =
    candidate.orderStatus as {
      orderState?: unknown;
    };

  return (
    typeof orderStatus.orderState ===
      "string" &&
    Boolean(
      orderStatus.orderState.trim()
    )
  );
}

/*
|--------------------------------------------------------------------------
| Assigned Carrier Helpers
|--------------------------------------------------------------------------
*/

function getAssignedCarrierId(
  order: ShipdayOrderDetails
): number | null {
  const nestedCarrierId =
    order.assignedCarrier?.id;

  if (
    typeof nestedCarrierId === "number" &&
    Number.isSafeInteger(nestedCarrierId) &&
    nestedCarrierId > 0
  ) {
    return nestedCarrierId;
  }

  if (
    typeof order.assignedCarrierId === "number" &&
    Number.isSafeInteger(order.assignedCarrierId) &&
    order.assignedCarrierId > 0
  ) {
    return order.assignedCarrierId;
  }

  return null;
}

function getAssignedCarrierName(
  order: ShipdayOrderDetails
): string | null {
  const name =
    order.assignedCarrier?.name;

  if (
    typeof name !== "string" ||
    !name.trim()
  ) {
    return null;
  }

  return name.trim();
}

interface ResolvedLiaDriver {
  driverId: string;

  carrierId: number;

  name: string | null;
}

async function resolveLiaDriver(
  carrierId: number
): Promise<ResolvedLiaDriver | null> {
  const snapshot =
    await getFirestore("default")
      .collection("drivers")
      .where(
        "shipday.carrierId",
        "==",
        carrierId
      )
      .limit(2)
      .get();

  if (snapshot.empty) {
    /*
      Shipday may assign an external carrier, or the LIA-to-Shipday carrier
      mapping may not have been synchronized yet. This is not a delivery
      synchronization failure; the order can still receive its status update.
    */
    console.warn(
      "No LIA driver is connected to the assigned Shipday carrier.",
      {
        carrierId,
      }
    );

    return null;
  }

  if (snapshot.size > 1) {
    throw new Error(
      `Multiple LIA drivers are connected to Shipday carrier ${carrierId}.`
    );
  }

  const document =
    snapshot.docs[0];

  const driver =
    document.data();

  if (driver.isApproved !== true) {
    console.warn(
      "The assigned Shipday carrier is linked to an unapproved LIA driver.",
      {
        carrierId,
        driverId: document.id,
      }
    );

    return null;
  }

  if (await isAccountDeletionRestricted(document.id)) {
    console.warn(
      "Shipday assigned a driver whose account deletion is pending.",
      {carrierId, driverId: document.id}
    );
    return null;
  }

  const firstName =
    typeof driver.firstName === "string"
      ? driver.firstName.trim()
      : "";

  const lastName =
    typeof driver.lastName === "string"
      ? driver.lastName.trim()
      : "";

  const fullName =
    `${firstName} ${lastName}`.trim();

  return {
    driverId:
      document.id,

    carrierId,

    name:
      fullName || null,
  };
}

/*
|--------------------------------------------------------------------------
| Delivery Sync Service
|--------------------------------------------------------------------------
*/

export class DeliverySyncService {
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
  | Synchronize Customer Orders
  |--------------------------------------------------------------------------
  */

  async syncCustomerOrders(
    customerId: string
  ): Promise<void> {
    console.log(
      `Synchronizing orders for customer ${customerId}`
    );

    const snapshot =
      await this.db
        .collection("orders")
        .where(
          "customer.uid",
          "==",
          customerId
        )
        .get();

    console.log(
      `Found ${snapshot.size} customer orders.`
    );

    for (
      const document of
      snapshot.docs
    ) {
      try {
        await this.syncOrder(
          document.id
        );
      } catch (error) {
        /*
          Customer order synchronization is a best-effort refresh. One
          malformed or unavailable Shipday delivery must not stop the
          remaining customer deliveries from receiving updates.
        */
        console.error(
          "Unable to synchronize customer delivery; continuing with remaining orders.",
          {
            orderId: document.id,
            error,
          }
        );
      }
    }

    console.log(
      "Customer delivery synchronization complete."
    );
  }


  /*
  |--------------------------------------------------------------------------
  | Synchronize Store Orders
  |--------------------------------------------------------------------------
  */

  async syncStoreOrders(
    storeId: string
  ): Promise<void> {
    console.log(
      "syncStoreOrders() called.",
      {
        storeId,
      }
    );

    /*
      Query the store's orders first, then select active Shipday deliveries
      in memory. This avoids requiring a composite index for a best-effort
      synchronization task and keeps one malformed legacy delivery from
      blocking the store orders page.
    */
    const storeOrdersSnapshot =
      await this.db
        .collection("orders")
        .where(
          "store.id",
          "==",
          storeId
        )
        .get();

    const activeDeliveryDocuments =
      storeOrdersSnapshot.docs.filter(
        (document) =>
          document.data().shipday?.active === true
      );

    console.log(
      `Found ${activeDeliveryDocuments.length} active store deliveries.`
    );

    for (
      const document of
      activeDeliveryDocuments
    ) {
      try {
        await this.syncOrder(
          document.id
        );
      } catch (error) {
        /*
          Shipday synchronization is informational at page-load time. The
          store must still be able to open and manage every confirmed order
          when one provider record is unavailable or malformed.
        */
        console.error(
          "Unable to synchronize store delivery; continuing with remaining orders.",
          {
            orderId: document.id,
            error,
          }
        );
      }
    }

    console.log(
      "Store delivery synchronization complete."
    );
  }


  /*
  |--------------------------------------------------------------------------
  | Synchronize Every Active Delivery
  |--------------------------------------------------------------------------
  */

  async syncActiveDeliveries(): Promise<void> {
    console.log(
      "Starting delivery synchronization..."
    );

    const snapshot =
      await this.db
        .collection("orders")
        .where(
          "shipday.active",
          "==",
          true
        )
        .get();

    console.log(
      `Found ${snapshot.size} active deliveries.`
    );

    for (
      const document of
      snapshot.docs
    ) {
      try {
        await this.syncOrder(
          document.id
        );
      } catch (error) {
        /*
          A single provider failure must not abort the scheduled pass.
          The next interval will retry this delivery while the other active
          deliveries continue synchronizing now.
        */
        console.error(
          "Unable to synchronize scheduled delivery; continuing with remaining deliveries.",
          {
            orderId: document.id,
            error,
          }
        );
      }
    }

    console.log(
      "Delivery synchronization complete."
    );
  }


  /*
  |--------------------------------------------------------------------------
  | Synchronize One Order
  |--------------------------------------------------------------------------
  */

  async syncOrder(
    orderId: string
  ): Promise<void> {
    console.log(
      `Synchronizing delivery for order ${orderId}`
    );

    /*
      Step 1:
      Load the Firestore order.
    */
    const orderDoc =
      await this.db
        .collection("orders")
        .doc(orderId)
        .get();

    if (!orderDoc.exists) {
      throw new Error(
        "Order not found."
      );
    }

    const order =
      orderDoc.data();

    if (!order) {
      throw new Error(
        "Order data is missing."
      );
    }

    /*
      Step 2:
      Verify that the order has a Shipday delivery.
    */
    if (!order.shipday?.orderId) {
      console.log(
        "Order has no Shipday delivery."
      );

      return;
    }

    if (
      typeof order.orderNumber !==
        "string" ||
      !order.orderNumber.trim()
    ) {
      throw new Error(
        "The order does not have a valid order number."
      );
    }

    /*
      Step 3:
      Load the latest delivery information from Shipday.
    */
    const rawShipdayOrder =
      await shipdayService
        .getOrderDetails(
          order.orderNumber
        );

    if (
      !isShipdayOrderDetails(
        rawShipdayOrder
      )
    ) {
      throw new Error(
        "Shipday returned an invalid order-details response."
      );
    }

    const shipdayOrder =
      rawShipdayOrder;

        const assignedCarrierId =
      getAssignedCarrierId(
        shipdayOrder
      );

    let resolvedDriver:
      ResolvedLiaDriver | null =
        null;

    let driverResolutionFailed =
      false;

    if (assignedCarrierId) {
      try {
        resolvedDriver =
          await resolveLiaDriver(
            assignedCarrierId
          );
      } catch (error) {
        /*
          A broken carrier mapping must not prevent Shipday's order status
          from being synchronized. Keep the existing driver snapshot when the
          lookup itself fails so a transient Firestore failure cannot erase it.
        */
        console.error(
          "Unable to resolve the LIA driver for the assigned Shipday carrier.",
          {
            orderId,
            carrierId: assignedCarrierId,
            error,
          }
        );

        driverResolutionFailed =
          true;
      }
    }

    /*
      Shipday documents -1 as the explicit no-carrier value. An assigned
      external carrier also has no LIA driver record, so remove a prior LIA
      driver snapshot in both cases rather than showing the wrong driver.
    */
    const shouldClearDriver =
      order.assignedCarrierId === -1 ||
      (Boolean(assignedCarrierId) &&
        !driverResolutionFailed &&
        resolvedDriver === null);

    const shipdayOrderState =
      shipdayOrder
        .orderStatus
        .orderState
        .trim();

    console.log(
      "Latest Shipday delivery received.",
      {
        orderNumber: order.orderNumber,
        orderState: shipdayOrderState,
        hasSignature:
          Boolean(
            shipdayProofUrls(
              shipdayOrder.proofOfDelivery,
            ).signatureUrl,
          ),
        proofImageCount:
          shipdayProofUrls(
            shipdayOrder.proofOfDelivery,
          ).imageUrls.length,
      },
    );

    /*
      Step 4:
      Convert the Shipday state into LIA statuses.
    */
    const mappedStatus =
      mapShipdayStatus(
        shipdayOrderState
      );

    console.log(
      "Mapped Shipday status:",
      mappedStatus
    );

    /*
     * Shipday proof URLs are copied into LIA private Storage before the
     * terminal order stops polling. Proof is optional: a missing or failed
     * copy must never delay delivery completion, settlement, or any other
     * order-processing step.
     */
    let deliveryProof: DeliveryProof | null = null;

    try {
      deliveryProof = await synchronizeDeliveryProof(
        orderId,
        shipdayOrder,
        order.delivery?.proofOfDelivery,
      );
    } catch (error) {
      console.error(
        "Unable to synchronize Shipday delivery proof.",
        {
          orderNumber: order.orderNumber,
          error: error instanceof Error
            ? error.message
            : "Unknown delivery-proof error.",
        },
      );
    }

    const currentProof = order.delivery?.proofOfDelivery;
    const proofAlreadySynchronized =
      deliveryProof === null ||
      (
        currentProof?.signature?.storagePath ===
          deliveryProof.signature?.storagePath &&
        Array.isArray(currentProof?.images) &&
        currentProof.images.length ===
          deliveryProof.images.length
      );

    /*
      Step 5:
      Skip the Firestore update when nothing changed.
    */
    const driverAlreadySynchronized =
      shouldClearDriver
        ? !order.delivery?.driverId &&
          !order.delivery?.shipdayCarrierId &&
          !order.delivery?.driverName
        : resolvedDriver
        ? order.delivery?.driverId ===
            resolvedDriver.driverId &&
          order.delivery?.shipdayCarrierId ===
            resolvedDriver.carrierId
        : true;

    if (
      order.shipday?.status ===
        mappedStatus.shipdayStatus &&
      order.status ===
        mappedStatus.orderStatus &&
      driverAlreadySynchronized &&
      proofAlreadySynchronized
    ) {
      console.log(
        "Order already synchronized."
      );

      return;
    }

    /*
      Step 6:
      Prepare the Firestore update.
    */
    const now =
      new Date();

    const updateData:
      Record<string, unknown> = {
        "shipday.status":
          mappedStatus.shipdayStatus,

        "shipday.lastUpdated":
          now,

        "shipday.lastSyncAt":
          now,
      };

    if (deliveryProof) {
      updateData[
        "delivery.proofOfDelivery"
      ] = {
        signature:
          deliveryProof.signature,
        images:
          deliveryProof.images,
        receivedAt:
          now,
      };
    }

    if (resolvedDriver) {
      updateData[
        "delivery.driverId"
      ] =
        resolvedDriver.driverId;

      updateData[
        "delivery.shipdayCarrierId"
      ] =
        resolvedDriver.carrierId;

      updateData[
        "delivery.driverName"
      ] =
        resolvedDriver.name ??
        getAssignedCarrierName(
          shipdayOrder
        );

      updateData[
        "delivery.assignedAt"
      ] =
        order.delivery?.assignedAt ??
        now;
    }

    if (shouldClearDriver) {
      updateData[
        "delivery.driverId"
      ] = FieldValue.delete();

      updateData[
        "delivery.shipdayCarrierId"
      ] = FieldValue.delete();

      updateData[
        "delivery.driverName"
      ] = FieldValue.delete();

      updateData[
        "delivery.assignedAt"
      ] = FieldValue.delete();
    }

    /*
      Update the LIA business status only when the mapper returns one.
    */
    if (
      mappedStatus.orderStatus
    ) {
      updateData.status =
        mappedStatus.orderStatus;

      updateData.statusHistory =
        FieldValue.arrayUnion({
          status:
            mappedStatus.orderStatus,

          timestamp:
            now,

          note:
            "Updated from Shipday",
        });
    }

    /*
      Stop polling terminal deliveries.
    */
    if (
      mappedStatus.shipdayStatus ===
        "delivered" ||
      mappedStatus.shipdayStatus ===
        "cancelled" ||
      mappedStatus.shipdayStatus ===
        "failed"
    ) {
      updateData[
        "shipday.active"
      ] = false;
    }

    await orderDoc.ref.update(
      updateData
    );

    console.log(
      "Firestore synchronized successfully."
    );
  }
}


/*
|--------------------------------------------------------------------------
| Shared Service
|--------------------------------------------------------------------------
*/

export const deliverySyncService =
  new DeliverySyncService();
