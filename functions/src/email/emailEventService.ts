import * as admin from "firebase-admin";
import {getFirestore} from "firebase-admin/firestore";
import {defineString} from "firebase-functions/params";
import {enqueueAdminEmail, enqueueEmail} from "./emailQueueService";
import {adminActionEmail, customerRefundClaimActivityEmail, deliveredOrderEmail, EmailReceiptItem, EmailReceiptPricing, newOrderEmail, storeRefundClaimEmail} from "./emailTemplates";

if (admin.apps.length === 0) admin.initializeApp();
const db = getFirestore("default");
const appUrl = defineString("APP_URL", {default: "https://www.liamarketplace.com"});
const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const finite = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;

function amountInCents(data: Record<string, unknown>, amountField: string, dollarField: string): number {
  const integerAmount = finite(data[amountField]);
  if (integerAmount !== null) return Math.max(0, Math.round(integerAmount));
  const dollarAmount = finite(data[dollarField]);
  return dollarAmount === null ? 0 : Math.max(0, Math.round(dollarAmount * 100));
}

function receiptItems(value: unknown): EmailReceiptItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    const item = candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate as Record<string, unknown> : {};
    const name = text(item.name);
    const quantity = Math.max(1, Math.round(finite(item.quantity) ?? 1));
    if (!name) return [];
    const sizeData = item.size && typeof item.size === "object" && !Array.isArray(item.size) ? item.size as Record<string, unknown> : {};
    const sizeValue = finite(sizeData.value);
    const sizeUnit = text(sizeData.unit);
    const size = sizeValue !== null && sizeUnit ? `${sizeValue} ${sizeUnit}` : null;
    const trustedLineTotal = finite(item.lineTotalAmount);
    const unitAmount = finite(item.unitPriceAmount);
    const legacyUnitPrice = finite(item.price);
    const lineTotalAmount = trustedLineTotal !== null ? trustedLineTotal : (unitAmount !== null ? unitAmount : Math.round((legacyUnitPrice ?? 0) * 100)) * quantity;
    return [{name, quantity, size, lineTotalAmount: Math.max(0, Math.round(lineTotalAmount))}];
  });
}

function receiptPricing(value: unknown): EmailReceiptPricing {
  const pricing = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    currency: text(pricing.currency) || "usd",
    subtotalAmount: amountInCents(pricing, "subtotalAmount", "subtotal"),
    deliveryFeeAmount: amountInCents(pricing, "deliveryFeeAmount", "deliveryFee"),
    serviceFeeAmount: amountInCents(pricing, "serviceFeeAmount", "serviceFee"),
    taxAmount: amountInCents(pricing, "taxAmount", "tax"),
    tipAmount: amountInCents(pricing, "tipAmount", "tip"),
    totalAmount: amountInCents(pricing, "totalAmount", "total"),
  };
}

function absolute(path: string): string {
  return `${appUrl.value().replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function queueStoreNewOrderEmail(orderId: string, ownerUid = ""): Promise<void> {
  const order = await db.collection("orders").doc(orderId).get();
  if (!order.exists) return;
  const data = order.data() ?? {};
  const store = data.store && typeof data.store === "object" ? data.store as Record<string, unknown> : {};
  const storeId = text(store.id);
  let currentStoreData: Record<string, unknown> = {};
  if (storeId) {
    const currentStore = await db.collection("stores").doc(storeId).get();
    currentStoreData = currentStore.data() ?? {};
    if (currentStore.data()?.emailNotifications === false || currentStore.data()?.orderNotifications === false) return;
  }
  const resolvedOwnerUid = ownerUid || text(currentStoreData.ownerId) || text(store.ownerId);
  const owner = resolvedOwnerUid ? await db.collection("users").doc(resolvedOwnerUid).get() : null;
  const email = text(owner?.data()?.email) || text(currentStoreData.email) || text(store.email);
  const template = newOrderEmail({storeName: text(store.name) || "Your store", orderNumber: text(data.orderNumber) || orderId.slice(0, 8), fulfillmentType: data.fulfillmentType === "pickup" ? "pickup" : "delivery", url: absolute(`/store/store-orders/${encodeURIComponent(orderId)}`)});
  await enqueueEmail({dedupeKey: `store-new-order:${orderId}`, category: "store_new_order", to: email, ...template, tags: {order_id: orderId}});
}

export async function queueCustomerDeliveredEmail(orderId: string, customerUid: string): Promise<void> {
  const [order, customer] = await Promise.all([db.collection("orders").doc(orderId).get(), db.collection("users").doc(customerUid).get()]);
  if (!order.exists) return;
  const data = order.data() ?? {};
  const embedded = data.customer && typeof data.customer === "object" ? data.customer as Record<string, unknown> : {};
  const email = text(customer.data()?.email) || text(embedded.email);
  const name = text(customer.data()?.displayName) || text(embedded.name) || "Customer";
  const embeddedStore = data.store && typeof data.store === "object" && !Array.isArray(data.store) ? data.store as Record<string, unknown> : {};
  const template = deliveredOrderEmail({
    fulfillmentType: data.fulfillmentType === "pickup" ? "pickup" : "delivery",
    customerName: name,
    storeName: text(embeddedStore.name) || "your local store",
    orderNumber: text(data.orderNumber) || orderId.slice(0, 8),
    url: absolute(`/orders/${encodeURIComponent(orderId)}`),
    items: receiptItems(data.items),
    pricing: receiptPricing(data.pricing),
  });
  await enqueueEmail({dedupeKey: `customer-order-delivered:${orderId}`, category: "customer_order_delivered", to: email, ...template, tags: {order_id: orderId}});
}

export async function queueAdminActionEmail(input: {dedupeKey: string; category: "admin_support" | "admin_refund" | "admin_order_zone"; title: string; summary: string; path: string}): Promise<void> {
  const template = adminActionEmail({title: input.title, summary: input.summary, url: absolute(input.path)});
  await enqueueAdminEmail({dedupeKey: input.dedupeKey, category: input.category, ...template});
}

export async function queueStoreRefundClaimEmail(claimId: string, orderId: string): Promise<void> {
  const order = await db.collection("orders").doc(orderId).get();
  if (!order.exists) return;
  const data = order.data() ?? {};
  const embeddedStore = data.store && typeof data.store === "object" ? data.store as Record<string, unknown> : {};
  const storeId = text(embeddedStore.id);
  if (!storeId) return;
  const store = await db.collection("stores").doc(storeId).get();
  const storeData = store.data() ?? {};
  if (storeData.emailNotifications === false) return;
  const owner = await db.collection("users").doc(text(storeData.ownerId)).get();
  const email = text(owner.data()?.email) || text(storeData.email) || text(embeddedStore.email);
  const template = storeRefundClaimEmail({storeName: text(storeData.name) || text(embeddedStore.name) || "Your store", orderNumber: text(data.orderNumber) || orderId.slice(0, 8), url: absolute(`/store/store-orders/${encodeURIComponent(orderId)}`)});
  await enqueueEmail({dedupeKey: `store-refund-claim:${claimId}`, category: "store_refund_claim", to: email, ...template, tags: {order_id: orderId, claim_id: claimId}});
}

export async function queueCustomerRefundClaimActivityEmail(input: {
  claimId: string;
  customerId: string;
  orderId: string;
  eventKey: string;
  title: string;
  summary: string;
}): Promise<void> {
  if (!input.customerId || !input.orderId) return;

  const [order, customer] = await Promise.all([
    db.collection("orders").doc(input.orderId).get(),
    db.collection("users").doc(input.customerId).get(),
  ]);
  if (!order.exists) return;

  const orderData = order.data() ?? {};
  const embeddedCustomer = orderData.customer &&
    typeof orderData.customer === "object" &&
    !Array.isArray(orderData.customer)
    ? orderData.customer as Record<string, unknown>
    : {};
  const customerData = customer.data() ?? {};
  const email = text(customerData.email) || text(embeddedCustomer.email);
  const customerName = text(customerData.displayName) ||
    text(embeddedCustomer.name) ||
    "Customer";
  const orderNumber = text(orderData.orderNumber) || input.orderId.slice(0, 8);
  const template = customerRefundClaimActivityEmail({
    customerName,
    orderNumber,
    title: input.title,
    summary: input.summary,
    url: absolute(`/orders/${encodeURIComponent(input.orderId)}`),
  });

  await enqueueEmail({
    dedupeKey: `customer-refund-claim:${input.claimId}:${input.eventKey}`,
    category: "customer_refund_claim",
    to: email,
    ...template,
    tags: {
      order_id: input.orderId,
      claim_id: input.claimId,
      event: input.eventKey,
    },
  });
}
