import * as admin from "firebase-admin";
import {FieldValue, Timestamp, getFirestore} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {requireAdminPermission} from "../admin/adminAuthorizationService";
import {writeAdminAuditLog} from "../admin/adminAuditLogService";

if (admin.apps.length === 0) admin.initializeApp();
const db = getFirestore("default");
type Data = Record<string, unknown>;
const record = (value: unknown): Data => value && typeof value === "object" && !Array.isArray(value) ? value as Data : {};
const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const amount = (value: unknown): number => typeof value === "number" && Number.isSafeInteger(value) ? value : 0;
const iso = (value: unknown): string | null => value instanceof Timestamp ? value.toDate().toISOString() : typeof value === "string" ? value : null;
const validId = (value: unknown): string => {
  const result = text(value);
  if (!result || result.includes("/") || result.length > 180) throw new HttpsError("invalid-argument", "A valid record ID is required.");
  return result;
};

const DEFAULT_CONTROLS = {
  checkoutPaused: false,
  transfersPaused: false,
  maintenanceMode: false,
  checkoutMessage: "Checkout is temporarily unavailable. Please try again shortly.",
  notificationReadRetentionDays: 90,
  notificationAbsoluteRetentionDays: 180,
  emailJobRetentionDays: 90,
  resolvedSupportRetentionDays: 730,
};

async function operationalControls(): Promise<typeof DEFAULT_CONTROLS> {
  const snapshot = await db.collection("settings").doc("operationalControls").get();
  return {...DEFAULT_CONTROLS, ...record(snapshot.data())};
}
export const getOperationalControlsForJobs = operationalControls;

async function statusRows(collection: string, status: string, limit = 20) {
  const snapshot = await db.collection(collection).where("status", "==", status).limit(limit).get();
  return snapshot.docs.map((document) => {
    const data = document.data();
    return {id: document.id, orderId: text(data.orderId), status, error: text(data.lastError) || text(record(data.workflow).lastError) || null, updatedAt: iso(data.updatedAt) || iso(data.createdAt)};
  });
}

export const getAdminOperationsOverview = onCall({region: "us-central1"}, async (request) => {
  await requireAdminPermission(request, "operations");
  const [failedTransfers, failedRefunds, failedDeletions, failedEmails, fatalErrors, openSupport, pendingClaims, pendingStores, pendingDrivers, controls, lastReconciliation] = await Promise.all([
    statusRows("paymentTransfers", "failed"), statusRows("paymentRefunds", "failed"), statusRows("accountDeletionRequests", "failed"), statusRows("emailJobs", "failed"),
    db.collection("clientErrorReports").where("severity", "==", "fatal").limit(20).get(),
    db.collection("accountSupportRequests").where("status", "in", ["open", "in_review", "responded"]).count().get(),
    db.collection("refundClaims").where("status", "==", "pending_review").count().get(),
    db.collection("stores").where("status", "==", "pending_review").count().get(),
    db.collection("drivers").where("status", "==", "pending_review").count().get(),
    operationalControls(), db.collection("adminDailyFinanceReports").orderBy("date", "desc").limit(1).get(),
  ]);
  const jobs = [
    ...failedTransfers.map((item) => ({...item, type: "transfer", title: "Failed payout transfer", href: "/admin/finance"})),
    ...failedRefunds.map((item) => ({...item, type: "refund", title: "Failed customer refund", href: "/admin/refund-claims"})),
    ...failedDeletions.map((item) => ({...item, type: "deletion", title: "Failed account deletion", href: `/admin/deletion-requests/${item.id}`})),
    ...failedEmails.map((item) => ({...item, type: "email", title: "Failed transactional email", href: "/admin/operations"})),
  ];
  const errors = fatalErrors.docs.map((document) => ({id: document.id, ...record(document.data()), createdAt: iso(document.data().createdAt)}));
  return {
    controls,
    health: {status: jobs.length || errors.length ? "attention" : "healthy", failedJobs: jobs.length, fatalClientErrors: errors.length, lastReconciliationAt: lastReconciliation.docs[0] ? iso(lastReconciliation.docs[0].data().generatedAt) : null},
    failedJobs: jobs.slice(0, 50), errors,
    actionQueue: [
      {type: "support", label: "Open support conversations", count: openSupport.data().count, href: "/admin/support"},
      {type: "refund", label: "Refund claims awaiting review", count: pendingClaims.data().count, href: "/admin/refund-claims"},
      {type: "store", label: "Store applications awaiting review", count: pendingStores.data().count, href: "/admin/store-applications"},
      {type: "driver", label: "Driver applications awaiting review", count: pendingDrivers.data().count, href: "/admin/driver-applications"},
      {type: "failed", label: "Failed jobs requiring recovery", count: jobs.length, href: "/admin/operations"},
    ].filter((item) => item.count > 0),
  };
});

export const retryAdminFailedJob = onCall({region: "us-central1"}, async (request) => {
  const administrator = await requireAdminPermission(request, "operations", "write");
  const input = record(request.data); const type = text(input.type); const id = validId(input.id); const reason = text(input.reason);
  if (reason.length < 5 || reason.length > 500) throw new HttpsError("invalid-argument", "Enter a recovery reason using 5 to 500 characters.");
  const collection = type === "transfer" ? "paymentTransfers" : type === "refund" ? "paymentRefunds" : type === "email" ? "emailJobs" : "";
  if (!collection) throw new HttpsError("invalid-argument", "This job type does not support recovery here.");
  const reference = db.collection(collection).doc(id);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists || text(snapshot.data()?.status) !== "failed") throw new HttpsError("failed-precondition", "Only a currently failed job can be retried.");
    const changes: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {updatedAt: FieldValue.serverTimestamp(), lastError: null, recoveryRequestedBy: administrator.uid, recoveryReason: reason};
    if (type === "email") Object.assign(changes, {status: "retry", attempts: 0, nextAttemptAt: FieldValue.serverTimestamp(), failedAt: null});
    else Object.assign(changes, {attemptCount: 0, nextRetryAt: new Date().toISOString()});
    transaction.update(reference, changes);
  });
  await writeAdminAuditLog(administrator, {action: "failed_job_retry_requested", targetType: type, targetId: id, reason});
  return {success: true};
});

function searchableResult(type: string, id: string, title: string, subtitle: string, href: string) { return {type, id, title, subtitle, href}; }

export const searchAdminWorkspace = onCall({region: "us-central1"}, async (request) => {
  const administrator = await requireAdminPermission(request, "operations");
  const query = text(record(request.data).query).toLowerCase();
  if (query.length < 2 || query.length > 120) throw new HttpsError("invalid-argument", "Search using 2 to 120 characters.");
  const results: ReturnType<typeof searchableResult>[] = [];
  const can = (permission: string) => administrator.role === "master_admin" || Boolean(administrator.permissions[permission as keyof typeof administrator.permissions]);
  if (can("orders")) {
    const orders = await db.collection("orders").where("orderNumber", "==", query.toUpperCase()).limit(10).get();
    orders.docs.forEach((document) => { const data = document.data(); results.push(searchableResult("order", document.id, text(data.orderNumber) || document.id, text(record(data.store).name), `/admin/orders/${document.id}`)); });
    const direct = await db.collection("orders").doc(query).get();
    if (direct.exists && !results.some((item) => item.id === direct.id)) results.push(searchableResult("order", direct.id, text(direct.data()?.orderNumber) || direct.id, "Order", `/admin/orders/${direct.id}`));
  }
  if (can("customers")) {
    const users = await db.collection("users").where("email", "==", query).limit(10).get();
    users.docs.forEach((document) => results.push(searchableResult("customer", document.id, text(document.data().displayName) || text(document.data().email), text(document.data().email), `/admin/customers?customerId=${document.id}`)));
  }
  if (can("stores")) {
    const stores = await db.collection("publicStoreProfiles").where("searchTokens", "array-contains", query).limit(10).get();
    stores.docs.forEach((document) => results.push(searchableResult("store", document.id, text(document.data().name), text(document.data().city), `/admin/store-applications/${document.id}`)));
  }
  if (can("support")) {
    const support = await db.collection("accountSupportRequests").where("ownerEmail", "==", query).limit(10).get();
    support.docs.forEach((document) => results.push(searchableResult("support", document.id, text(document.data().ownerName), text(document.data().reason), `/admin/support?request=${document.id}`)));
  }
  return {results: results.slice(0, 30)};
});

async function reconcileDate(date: string): Promise<Data> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpsError("invalid-argument", "Use a valid YYYY-MM-DD date.");
  const start = Timestamp.fromDate(new Date(`${date}T00:00:00.000Z`)); const end = Timestamp.fromDate(new Date(`${date}T23:59:59.999Z`));
  const ledger = await db.collection("paymentLedger").where("createdAt", ">=", start).where("createdAt", "<=", end).get();
  const totals = {customerPayments: 0, platformRevenue: 0, stripeFees: 0, refunds: 0, storeAllocated: 0, driverAllocated: 0, transfersCompleted: 0};
  const orderIds = new Set<string>();
  ledger.docs.forEach((document) => { const data = document.data(); const metadata = record(data.metadata); if (data.event === "allocation_created") { orderIds.add(text(data.orderId)); totals.customerPayments += amount(data.amount); totals.platformRevenue += amount(metadata.platformRevenue); totals.storeAllocated += amount(metadata.storeAmount); totals.driverAllocated += amount(metadata.driverAmount); } if (data.event === "stripe_processing_fee_recorded") totals.stripeFees += amount(data.amount); if (data.event === "refund_completed") totals.refunds += amount(data.amount); });
  const reconciledOrderIds = [...orderIds].filter(Boolean);
  for (let index = 0; index < reconciledOrderIds.length; index += 30) {
    const transfers = await db.collection("paymentTransfers").where("orderId", "in", reconciledOrderIds.slice(index, index + 30)).get();
    transfers.docs.forEach((document) => { if (text(document.data().status) === "completed") totals.transfersCompleted += amount(document.data().amount); });
  }
  const expectedTransfers = totals.storeAllocated + totals.driverAllocated;
  const discrepancyAmount = expectedTransfers - totals.transfersCompleted;
  const report = {date, totals, expectedTransfers, discrepancyAmount, reconciled: discrepancyAmount === 0, ledgerEventCount: ledger.size, orderCount: reconciledOrderIds.length, generatedAt: FieldValue.serverTimestamp()};
  await db.collection("adminDailyFinanceReports").doc(date).set(report, {merge: true});
  return {...report, generatedAt: new Date().toISOString()};
}

export const runAdminDailyFinancialReconciliation = onCall({region: "us-central1", timeoutSeconds: 300}, async (request) => {
  const administrator = await requireAdminPermission(request, "finance", "write"); const date = text(record(request.data).date);
  const report = await reconcileDate(date); await writeAdminAuditLog(administrator, {action: "daily_financial_reconciliation_run", targetType: "finance_day", targetId: date}); return {report};
});

export const getAdminDailyFinanceReports = onCall({region: "us-central1"}, async (request) => {
  await requireAdminPermission(request, "finance"); const snapshot = await db.collection("adminDailyFinanceReports").orderBy("date", "desc").limit(90).get();
  return {reports: snapshot.docs.map((document) => ({id: document.id, ...document.data(), generatedAt: iso(document.data().generatedAt)}))};
});

export const reconcileDailyFinances = onSchedule({schedule: "every day 04:30", timeZone: "America/Chicago", region: "us-central1", retryCount: 2}, async () => {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10); await reconcileDate(yesterday);
});

export const cleanupResolvedSupportRequests = onSchedule({schedule: "every day 04:50", timeZone: "America/Chicago", region: "us-central1", retryCount: 1}, async () => {
  const controls = await operationalControls(); const cutoff = Timestamp.fromMillis(Date.now() - controls.resolvedSupportRetentionDays * 86400000);
  const snapshot = await db.collection("accountSupportRequests").where("status", "==", "resolved").where("updatedAt", "<", cutoff).limit(100).get();
  for (const request of snapshot.docs) {
    const messages = await request.ref.collection("messages").limit(400).get(); const batch = db.batch(); messages.docs.forEach((message) => batch.delete(message.ref)); if (messages.size < 400) batch.delete(request.ref); await batch.commit();
  }
  console.info("Resolved support retention cleanup completed.", {deleted: snapshot.size, retentionDays: controls.resolvedSupportRetentionDays});
});

export const getAdminOperationalControls = onCall({region: "us-central1"}, async (request) => { await requireAdminPermission(request, "settings"); return {controls: await operationalControls()}; });

export const saveAdminOperationalControls = onCall({region: "us-central1"}, async (request) => {
  const administrator = await requireAdminPermission(request, "settings", "write"); const input = record(request.data); const next = record(input.controls);
  const controls = {
    checkoutPaused: next.checkoutPaused === true, transfersPaused: next.transfersPaused === true, maintenanceMode: next.maintenanceMode === true,
    checkoutMessage: text(next.checkoutMessage).slice(0, 240) || DEFAULT_CONTROLS.checkoutMessage,
    notificationReadRetentionDays: Math.min(365, Math.max(30, amount(next.notificationReadRetentionDays))),
    notificationAbsoluteRetentionDays: Math.min(730, Math.max(90, amount(next.notificationAbsoluteRetentionDays))),
    emailJobRetentionDays: Math.min(365, Math.max(30, amount(next.emailJobRetentionDays))),
    resolvedSupportRetentionDays: Math.min(2555, Math.max(365, amount(next.resolvedSupportRetentionDays))),
  };
  if (controls.notificationAbsoluteRetentionDays < controls.notificationReadRetentionDays) throw new HttpsError("invalid-argument", "Unread notification retention cannot be shorter than read retention.");
  await db.collection("settings").doc("operationalControls").set({...controls, updatedAt: FieldValue.serverTimestamp(), updatedBy: administrator.uid}, {merge: true});
  await writeAdminAuditLog(administrator, {action: "operational_controls_updated", targetType: "settings", targetId: "operationalControls", details: {checkoutPaused: controls.checkoutPaused, transfersPaused: controls.transfersPaused, maintenanceMode: controls.maintenanceMode}});
  return {success: true, controls};
});

export async function checkoutOperationalGuard(): Promise<void> {
  const controls = await operationalControls();
  if (controls.maintenanceMode || controls.checkoutPaused) throw new HttpsError("unavailable", controls.checkoutMessage);
}

export async function transfersOperationallyPaused(): Promise<boolean> { return (await operationalControls()).transfersPaused; }
