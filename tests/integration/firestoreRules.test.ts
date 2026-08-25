import {readFileSync} from "node:fs";
import {
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {afterAll, beforeAll, beforeEach, describe, it} from "vitest";

const PROJECT_ID = "demo-lia-store-tests";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  const [host = "127.0.0.1", portText = "8085"] =
    (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8085").split(":");

  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host,
      port: Number(portText),
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      db.doc("users/customer-1").set({uid: "customer-1", accountType: "customer"}),
      db.doc("users/customer-2").set({uid: "customer-2", accountType: "customer"}),
      db.doc("users/store-owner").set({uid: "store-owner", accountType: "store_owner"}),
      db.doc("users/other-store-owner").set({uid: "other-store-owner", accountType: "store_owner"}),
      db.doc("users/store-staff").set({uid: "store-staff", accountType: "store_staff", isActive: true}),
      db.doc("storeStaff/store-staff").set({storeId: "store-1", ownerId: "store-owner", isActive: true, permissions: {orders: "read"}}),
      db.doc("admins/master-admin").set({
        email: "master@lia.test",
        isActive: true,
        role: "master_admin",
      }),
      db.doc("stores/store-1").set({
        ownerId: "store-owner",
        onboardingCompleted: true,
        isApproved: true,
      }),
      db.doc("storeWorkspaceStatuses/store-owner").set({isApproved: true, status: "approved"}),
      db.doc("storePublicProfiles/store-1").set({name: "Test Store", isActive: true}),
      db.doc("productPublicProfiles/product-1").set({name: "Rice", storeId: "store-1"}),
      db.doc("users/customer-1/notifications/notification-1").set({title: "Order update"}),
      db.doc("orders/order-1").set({
        customer: {uid: "customer-1"},
        store: {id: "store-1"},
        checkoutStatus: "confirmed",
        payment: {status: "paid"},
      }),
    ]);
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe("Firestore account isolation", () => {
  it("lets customers read their own profile but not another customer's profile", async () => {
    const db = testEnv.authenticatedContext("customer-1").firestore();
    await assertSucceeds(db.doc("users/customer-1").get());
    await assertFails(db.doc("users/customer-2").get());
  });

  it("keeps nested notifications private to their owner", async () => {
    const ownerDb = testEnv.authenticatedContext("customer-1").firestore();
    const otherDb = testEnv.authenticatedContext("customer-2").firestore();
    await assertSucceeds(ownerDb.doc("users/customer-1/notifications/notification-1").get());
    await assertFails(otherDb.doc("users/customer-1/notifications/notification-1").get());
  });

  it("locks private data when account deletion is pending", async () => {
    await testEnv.withSecurityRulesDisabled((context) =>
      context.firestore().doc("users/customer-1").update({accountDeletionState: "deletion_pending"}),
    );
    const db = testEnv.authenticatedContext("customer-1").firestore();
    await assertFails(db.doc("users/customer-1").get());
    await assertFails(db.doc("users/customer-1/notifications/notification-1").get());
  });

  it("requires the deletion engine to remove a user profile", async () => {
    const customerDb = testEnv.authenticatedContext("customer-1").firestore();
    await assertFails(customerDb.doc("users/customer-1").delete());
  });

  it("prevents an administrator client from bypassing the deletion engine", async () => {
    const adminDb = testEnv.authenticatedContext("master-admin", {
      email: "master@lia.test",
    }).firestore();
    await assertFails(adminDb.doc("users/customer-1").delete());
  });
});

describe("Firestore marketplace access", () => {
  it("lets active store staff watch only their assigned owner's workspace status", async () => {
    const db = testEnv.authenticatedContext("store-staff").firestore();
    await assertSucceeds(db.doc("storeWorkspaceStatuses/store-owner").get());
    await assertFails(db.doc("storeWorkspaceStatuses/other-store-owner").get());
    await assertFails(db.doc("storeStaff/store-staff").get());
  });
  it("allows public reads only from sanitized catalog projections", async () => {
    const publicDb = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(publicDb.doc("storePublicProfiles/store-1").get());
    await assertSucceeds(publicDb.doc("productPublicProfiles/product-1").get());
    await assertFails(publicDb.doc("stores/store-1").get());
  });

  it("prevents clients from writing server-managed catalog projections", async () => {
    const db = testEnv.authenticatedContext("store-owner").firestore();
    await assertFails(db.doc("storePublicProfiles/store-1").update({name: "Changed"}));
    await assertFails(db.doc("productPublicProfiles/product-1").update({name: "Changed"}));
  });
});

describe("Firestore paid order visibility", () => {
  it("allows the owning customer and store owner to read a confirmed paid order", async () => {
    const customerDb = testEnv.authenticatedContext("customer-1").firestore();
    const storeDb = testEnv.authenticatedContext("store-owner").firestore();
    await assertSucceeds(customerDb.doc("orders/order-1").get());
    await assertSucceeds(storeDb.doc("orders/order-1").get());
  });

  it("rejects unrelated customers and store owners", async () => {
    const customerDb = testEnv.authenticatedContext("customer-2").firestore();
    const storeDb = testEnv.authenticatedContext("other-store-owner").firestore();
    await assertFails(customerDb.doc("orders/order-1").get());
    await assertFails(storeDb.doc("orders/order-1").get());
  });

  it("allows the active master admin whose token email matches", async () => {
    const adminDb = testEnv.authenticatedContext("master-admin", {
      email: "master@lia.test",
    }).firestore();
    await assertSucceeds(adminDb.doc("users/customer-1").get());
    await assertSucceeds(adminDb.doc("orders/order-1").get());
  });
});
