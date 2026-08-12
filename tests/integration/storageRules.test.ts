import {readFileSync} from "node:fs";
import {
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {afterAll, beforeAll, describe, it} from "vitest";

const PROJECT_ID = "demo-lia-store-storage-tests";
const IMAGE_ID = "1723456789000-123e4567-e89b-12d3-a456-426614174000";
const SMALL_IMAGE = new Uint8Array([1, 2, 3, 4]);

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  const [host = "127.0.0.1", portText = "9199"] =
    (process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? "127.0.0.1:9199").split(":");

  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    storage: {
      host,
      port: Number(portText),
      rules: readFileSync("storage.rules", "utf8"),
    },
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
});
