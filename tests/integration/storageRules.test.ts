import {readFileSync} from "node:fs";
import {
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {afterAll, beforeAll, beforeEach, describe, it} from "vitest";

const PROJECT_ID = "demo-lia-store-tests";
const IMAGE_ID = "1723456789000-123e4567-e89b-12d3-a456-426614174000";
const SMALL_IMAGE = new Uint8Array([1, 2, 3, 4]);

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  const [storageHost = "127.0.0.1", storagePortText = "9199"] =
    (process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? "127.0.0.1:9199").split(":");
  const [firestoreHost = "127.0.0.1", firestorePortText = "8085"] =
    (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8085").split(":");

  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: firestoreHost,
      port: Number(firestorePortText),
      rules: readFileSync("firestore.rules", "utf8"),
    },
    storage: {
      host: storageHost,
      port: Number(storagePortText),
      rules: readFileSync("storage.rules", "utf8"),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().doc("stores/store-1").set({
      ownerId: "owner-1",
      onboardingCompleted: false,
      isApproved: false,
    });
    await context.firestore().doc("users/customer-1").set({
      accountType: "customer",
      isActive: true,
      profileImageStatus: "processing",
      profileImageOriginalPath: `users/customer-1/images/originals/profile/${IMAGE_ID}.png`,
    });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

function storeMetadata(overrides: Record<string, string> = {}) {
  return {
    contentType: "image/jpeg",
    customMetadata: {
      storeId: "store-1",
      imageId: IMAGE_ID,
      imageField: "logo",
      processingType: "store-image-original",
      ...overrides,
    },
  };
}

function customerMetadata(overrides: Record<string, string> = {}) {
  return {
    contentType: "image/png",
    customMetadata: {
      userId: "customer-1",
      imageId: IMAGE_ID,
      processingType: "customer-profile-image-original",
      ...overrides,
    },
  };
}

function productMetadata(overrides: Record<string, string> = {}) {
  return {
    contentType: "image/jpeg",
    customMetadata: {
      storeId: "store-1",
      productId: "product-1",
      imageId: IMAGE_ID,
      galleryImageId: IMAGE_ID,
      processingType: "product-gallery-image-original",
      ...overrides,
    },
  };
}

describe("store product gallery rules", () => {
  const path = `stores/store-1/products/product-1/gallery/${IMAGE_ID}/original.jpg`;

  it("accepts the server-reserved original using the store upload claim", async () => {
    const storage = testEnv.authenticatedContext("owner-1", {storeUploadStoreId: "store-1"}).storage();
    await assertSucceeds(storage.ref(path).put(SMALL_IMAGE, productMetadata()));
  });

  it("rejects missing claims and mismatched reservation metadata", async () => {
    await assertFails(testEnv.authenticatedContext("owner-1").storage().ref(path).put(SMALL_IMAGE, productMetadata()));
    const storage = testEnv.authenticatedContext("owner-1", {storeUploadStoreId: "store-1"}).storage();
    await assertFails(storage.ref(path).put(SMALL_IMAGE, productMetadata({productId: "product-2"})));
    await assertFails(storage.ref(path).put(SMALL_IMAGE, productMetadata({processingType: "wrong"})));
  });
});

describe("store onboarding image rules", () => {
  it("accepts a supported reserved original with matching metadata", async () => {
    const storage = testEnv.authenticatedContext("owner-1", {
      storeUploadStoreId: "store-1",
    }).storage();
    await assertSucceeds(
      storage.ref(`stores/store-1/images/originals/logo/${IMAGE_ID}.jpg`)
        .put(SMALL_IMAGE, storeMetadata()),
    );
  });

  it("rejects unsupported fields, MIME types, filenames, and mismatched metadata", async () => {
    const storage = testEnv.authenticatedContext("owner-1", {
      storeUploadStoreId: "store-1",
    }).storage();
    await assertFails(
      storage.ref(`stores/store-1/images/originals/arbitrary/${IMAGE_ID}.jpg`)
        .put(SMALL_IMAGE, storeMetadata({imageField: "arbitrary"})),
    );
    await assertFails(
      storage.ref(`stores/store-1/images/originals/logo/${IMAGE_ID}.txt`)
        .put(SMALL_IMAGE, {...storeMetadata(), contentType: "text/plain"}),
    );
    await assertFails(
      storage.ref("stores/store-1/images/originals/logo/unreserved.jpg")
        .put(SMALL_IMAGE, storeMetadata()),
    );
    await assertFails(
      storage.ref(`stores/store-1/images/originals/logo/${IMAGE_ID}.jpg`)
        .put(SMALL_IMAGE, storeMetadata({storeId: "store-2"})),
    );
  });
});

describe("customer profile image rules", () => {
  it("accepts the callable-reserved original with matching metadata", async () => {
    const storage = testEnv.authenticatedContext("customer-1").storage();
    await assertSucceeds(
      storage.ref(`users/customer-1/images/originals/profile/${IMAGE_ID}.png`)
        .put(SMALL_IMAGE, customerMetadata()),
    );
  });

  it("rejects uploads for another user or without the reservation metadata", async () => {
    const storage = testEnv.authenticatedContext("customer-1").storage();
    await assertFails(
      storage.ref(`users/customer-2/images/originals/profile/${IMAGE_ID}.png`)
        .put(SMALL_IMAGE, customerMetadata({userId: "customer-2"})),
    );
    await assertFails(
      storage.ref(`users/customer-1/images/originals/profile/${IMAGE_ID}.png`)
        .put(SMALL_IMAGE, customerMetadata({processingType: "wrong"})),
    );
    await assertFails(
      storage.ref("users/customer-1/images/originals/profile/random.png")
        .put(SMALL_IMAGE, customerMetadata()),
    );
  });

  it("rejects oversized originals", async () => {
    const storage = testEnv.authenticatedContext("customer-1").storage();
    await assertFails(
      storage.ref(`users/customer-1/images/originals/profile/${IMAGE_ID}.png`)
        .put(new Uint8Array(10 * 1024 * 1024 + 1), customerMetadata()),
    );
  });

  it("rejects customer image access after deletion lock or suspension", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc("users/customer-1").update({accountDeletionState: "deletion_pending"});
    });
    const storage = testEnv.authenticatedContext("customer-1").storage();
    await assertFails(
      storage.ref(`users/customer-1/images/originals/profile/${IMAGE_ID}.png`)
        .put(SMALL_IMAGE, customerMetadata()),
    );

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc("users/customer-1").update({accountDeletionState: null, isActive: false});
    });
    await assertFails(
      storage.ref(`users/customer-1/images/originals/profile/${IMAGE_ID}.png`)
        .put(SMALL_IMAGE, customerMetadata()),
    );
  });
});

describe("customer refund evidence rules", () => {
  const orderId = "order-1";
  const uploadId = "evidence-1";
  const fileName = "original.jpg";
  const path = `users/customer-1/refund-claim-evidence/${orderId}/${uploadId}/${fileName}`;
  const metadata = {
    contentType: "image/jpeg",
    customMetadata: {
      customerId: "customer-1",
      orderId,
      evidenceUploadId: uploadId,
    },
  };

  async function reserve(expiresAt: Date) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`refundClaimEvidenceUploads/${uploadId}`).set({
        status: "reserved",
        customerId: "customer-1",
        orderId,
        storagePath: path,
        expiresAt,
      });
    });
  }

  it("accepts only the exact active server reservation", async () => {
    await reserve(new Date(Date.now() + 60_000));
    const storage = testEnv.authenticatedContext("customer-1").storage();
    await assertSucceeds(storage.ref(path).put(SMALL_IMAGE, metadata));
    await assertFails(
      storage.ref(`users/customer-1/refund-claim-evidence/${orderId}/other-upload/${fileName}`)
        .put(SMALL_IMAGE, {...metadata, customMetadata: {...metadata.customMetadata, evidenceUploadId: "other-upload"}}),
    );
  });

  it("rejects missing, expired, and deletion-locked reservations", async () => {
    const storage = testEnv.authenticatedContext("customer-1").storage();
    await assertFails(storage.ref(path).put(SMALL_IMAGE, metadata));
    await reserve(new Date(Date.now() - 60_000));
    await assertFails(storage.ref(path).put(SMALL_IMAGE, metadata));
    await reserve(new Date(Date.now() + 60_000));
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc("users/customer-1").update({accountDeletionState: "deletion_processing"});
    });
    await assertFails(storage.ref(path).put(SMALL_IMAGE, metadata));
  });
});
