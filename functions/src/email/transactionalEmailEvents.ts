import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {queueCustomerDeliveredEmail, queueStoreNewOrderEmail} from "./emailEventService";

type Data = Record<string, unknown>;
const record = (value: unknown): Data => value && typeof value === "object" && !Array.isArray(value) ? value as Data : {};
const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";

export const orderTransactionalEmails = onDocumentWritten({document: "orders/{orderId}", region: "us-central1", database: "default"}, async (event) => {
  if (!event.data?.after.exists) return;
  const before = (event.data.before.data() ?? {}) as Data;
  const after = (event.data.after.data() ?? {}) as Data;
  const beforePaid = before.checkoutStatus === "confirmed" && record(before.payment).status === "paid";
  const afterPaid = after.checkoutStatus === "confirmed" && record(after.payment).status === "paid";
  const jobs: Promise<void>[] = [];
  if (!beforePaid && afterPaid) {
    const embeddedStore = record(after.store);
    const storeId = text(embeddedStore.id);
    if (storeId) jobs.push(queueStoreNewOrderEmail(event.params.orderId));
  }
  if (text(before.status) !== "completed" && text(after.status) === "completed") {
    const customerUid = text(record(after.customer).uid);
    if (customerUid) jobs.push(queueCustomerDeliveredEmail(event.params.orderId, customerUid));
  }
  await Promise.all(jobs);
});
