const brand = "#f97316";
const brandDark = "#c2410c";
const ink = "#111827";
const muted = "#6b7280";

export interface EmailReceiptItem {
  name: string;
  quantity: number;
  lineTotalAmount: number;
  size?: string | null;
}

export interface EmailReceiptPricing {
  currency: string;
  subtotalAmount: number;
  deliveryFeeAmount: number;
  serviceFeeAmount: number;
  taxAmount: number;
  tipAmount: number;
  totalAmount: number;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;"}[character] ?? character));
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase() || "USD",
    }).format(Math.max(0, Math.round(amount)) / 100);
  } catch {
    return `$${(Math.max(0, Math.round(amount)) / 100).toFixed(2)}`;
  }
}

function actionButton(action: {label: string; url: string}): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 4px"><tr><td style="border-radius:999px;background:${brand}"><a href="${escapeHtml(action.url)}" style="display:inline-block;padding:14px 24px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700">${escapeHtml(action.label)}</a></td></tr></table>`;
}

function layout(input: {title: string; preheader: string; body: string; action?: {label: string; url: string}}): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.title)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:${ink}">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(input.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5"><tr><td align="center" style="padding:28px 12px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden">
      <tr><td style="padding:24px 28px;background:${brand};background:linear-gradient(135deg,${brand},${brandDark});color:#ffffff">
        <div style="font-size:22px;font-weight:800;letter-spacing:.2px">LIA Marketplace</div>
        <div style="margin-top:5px;font-size:13px;color:#ffedd5">Local stores. Thoughtful delivery.</div>
      </td></tr>
      <tr><td style="padding:30px 28px">
        <h1 style="margin:0 0 18px;font-size:25px;line-height:1.25;color:${ink}">${escapeHtml(input.title)}</h1>
        ${input.body}
        ${input.action ? actionButton(input.action) : ""}
      </td></tr>
      <tr><td style="padding:20px 28px;border-top:1px solid #e5e7eb;background:#fafafa;text-align:center">
        <p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:${muted}">This is an important transactional message from LIA Marketplace.</p>
        <p style="margin:0;font-size:12px;line-height:1.5;color:${muted}">&copy; ${new Date().getUTCFullYear()} LIA Marketplace. All rights reserved.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

function detailRow(label: string, value: string, strong = false): string {
  return `<tr><td style="padding:8px 0;color:${muted};font-size:14px">${escapeHtml(label)}</td><td align="right" style="padding:8px 0;color:${ink};font-size:14px;${strong ? "font-weight:800" : "font-weight:600"}">${escapeHtml(value)}</td></tr>`;
}

function receipt(input: {storeName: string; orderNumber: string; items: EmailReceiptItem[]; pricing: EmailReceiptPricing}): string {
  const itemRows = input.items.slice(0, 20).map((item) => {
    const description = `${Math.max(1, Math.round(item.quantity))} × ${item.name}${item.size ? ` · ${item.size}` : ""}`;
    return detailRow(description, money(item.lineTotalAmount, input.pricing.currency));
  }).join("");
  const extraItems = input.items.length > 20 ? detailRow("Additional items", `${input.items.length - 20} more`) : "";
  const pricing = input.pricing;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border:1px solid #e5e7eb;border-radius:10px">
    <tr><td style="padding:18px 20px 10px">
      <div style="font-size:16px;font-weight:800;color:${ink}">Receipt</div>
      <div style="margin-top:4px;font-size:13px;color:${muted}">${escapeHtml(input.storeName)} · ${escapeHtml(input.orderNumber)}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;border-collapse:collapse">
        ${itemRows}${extraItems}
        <tr><td colspan="2" style="padding-top:8px;border-top:1px solid #e5e7eb"></td></tr>
        ${detailRow("Subtotal", money(pricing.subtotalAmount, pricing.currency))}
        ${detailRow("Delivery fee", money(pricing.deliveryFeeAmount, pricing.currency))}
        ${pricing.serviceFeeAmount > 0 ? detailRow("Service fee", money(pricing.serviceFeeAmount, pricing.currency)) : ""}
        ${detailRow("Tax", money(pricing.taxAmount, pricing.currency))}
        ${pricing.tipAmount > 0 ? detailRow("Driver tip", money(pricing.tipAmount, pricing.currency)) : ""}
        <tr><td colspan="2" style="padding-top:8px;border-top:1px solid #e5e7eb"></td></tr>
        ${detailRow("Total", money(pricing.totalAmount, pricing.currency), true)}
      </table>
    </td></tr>
  </table>`;
}

export function emailVerificationEmail(input: {displayName: string; url: string}) {
  const title = "Confirm your LIA email";
  const name = input.displayName.trim() || "there";
  const body = `<div style="display:inline-block;padding:6px 10px;border-radius:999px;background:#fff7ed;color:${brandDark};font-size:12px;font-weight:800">EMAIL VERIFICATION</div><p style="margin:18px 0 0;line-height:1.65;color:#374151">Hi ${escapeHtml(name)}, confirm this email address to finish setting up your LIA Marketplace account.</p><p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:${muted}">This secure link expires automatically. If you did not create or request access to a LIA account, you can safely ignore this email.</p>`;
  const text = `Hi ${name}, confirm your email address to finish setting up your LIA Marketplace account: ${input.url}\n\nIf you did not request this, you can ignore this email.`;
  return {subject: title, text, html: layout({title, preheader: "Confirm your email to finish setting up your LIA account.", body, action: {label: "Confirm email", url: input.url}})};
}

export function passwordResetEmail(input: {displayName: string; url: string}) {
  const title = "Reset your LIA password";
  const name = input.displayName.trim() || "there";
  const body = `<div style="display:inline-block;padding:6px 10px;border-radius:999px;background:#fff7ed;color:${brandDark};font-size:12px;font-weight:800">PASSWORD RESET</div><p style="margin:18px 0 0;line-height:1.65;color:#374151">Hi ${escapeHtml(name)}, use the secure button below to choose a new password for your LIA Marketplace account.</p><p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:${muted}">If you did not request a password reset, do not use this link. Your current password will remain unchanged.</p>`;
  const text = `Hi ${name}, reset your LIA Marketplace password using this secure link: ${input.url}\n\nIf you did not request this, ignore this email and your password will remain unchanged.`;
  return {subject: title, text, html: layout({title, preheader: "A secure password reset was requested for your LIA account.", body, action: {label: "Reset password", url: input.url}})};
}

export function newOrderEmail(input: {storeName: string; orderNumber: string; url: string}) {
  const title = `New paid order ${input.orderNumber}`;
  const text = `${input.storeName}, you received a new paid order. Open LIA to review and accept it: ${input.url}`;
  const body = `<div style="display:inline-block;padding:6px 10px;border-radius:999px;background:#fff7ed;color:${brandDark};font-size:12px;font-weight:800">NEW ORDER</div><p style="margin:18px 0 0;line-height:1.65;color:#374151">${escapeHtml(input.storeName)}, you received a new paid customer order. Open the secure store workspace to review the items and begin fulfillment.</p>`;
  return {subject: title, text, html: layout({title, preheader: `A new paid order is ready for ${input.storeName}.`, body, action: {label: "Review order", url: input.url}})};
}

export function deliveredOrderEmail(input: {customerName: string; storeName: string; orderNumber: string; url: string; items: EmailReceiptItem[]; pricing: EmailReceiptPricing}) {
  const title = `Order ${input.orderNumber} was delivered`;
  const textItems = input.items.map((item) => `${Math.max(1, Math.round(item.quantity))} x ${item.name}: ${money(item.lineTotalAmount, input.pricing.currency)}`).join("\n");
  const text = `${input.customerName}, your LIA order from ${input.storeName} was delivered.\n\nOrder: ${input.orderNumber}\n${textItems}\nTotal: ${money(input.pricing.totalAmount, input.pricing.currency)}\n\nView your protected delivery confirmation and leave feedback: ${input.url}`;
  const body = `<div style="display:inline-block;padding:6px 10px;border-radius:999px;background:#ecfdf5;color:#047857;font-size:12px;font-weight:800">DELIVERED</div><p style="margin:18px 0 0;line-height:1.65;color:#374151">Hi ${escapeHtml(input.customerName)}, your order from <strong>${escapeHtml(input.storeName)}</strong> has been delivered. Thank you for supporting an independent local business.</p>${receipt(input)}<p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:${muted}">Delivery confirmation and any delivery photo remain protected inside your LIA account.</p>`;
  return {subject: title, text, html: layout({title, preheader: `${input.orderNumber} from ${input.storeName} has arrived.`, body, action: {label: "View order and leave feedback", url: input.url}})};
}

export function adminActionEmail(input: {title: string; summary: string; url: string}) {
  const body = `<p style="margin:0;line-height:1.65;color:#374151">${escapeHtml(input.summary)}</p><p style="margin:16px 0 0;line-height:1.65;color:${muted}">Sensitive customer and order details are available only inside the protected Admin workspace.</p>`;
  return {subject: input.title, text: `${input.summary} Review securely in LIA: ${input.url}`, html: layout({title: input.title, preheader: input.summary, body, action: {label: "Open Admin workspace", url: input.url}})};
}

export function inventoryDigestEmail(input: {storeName: string; productNames: string[]; url: string}) {
  const title = `${input.productNames.length} inventory item${input.productNames.length === 1 ? "" : "s"} need attention`;
  const list = input.productNames.slice(0, 20).map((name) => `<li style="margin:8px 0">${escapeHtml(name)}</li>`).join("");
  const body = `<p style="margin:0;line-height:1.65;color:#374151">${escapeHtml(input.storeName)}, these products are low or out of stock:</p><ul style="padding-left:22px;line-height:1.5;color:#374151">${list}</ul>`;
  return {subject: title, text: `${input.storeName}: ${input.productNames.join(", ")}. Update inventory: ${input.url}`, html: layout({title, preheader: `${input.productNames.length} products need inventory attention.`, body, action: {label: "Update inventory", url: input.url}})};
}

export function storeRefundClaimEmail(input: {storeName: string; orderNumber: string; url: string}) {
  const title = `Refund claim for order ${input.orderNumber}`;
  const body = `<div style="display:inline-block;padding:6px 10px;border-radius:999px;background:#fef2f2;color:#b91c1c;font-size:12px;font-weight:800">ACTION MAY BE REQUIRED</div><p style="margin:18px 0 0;line-height:1.65;color:#374151">${escapeHtml(input.storeName)}, a customer submitted a refund or return claim connected to this order. Review the protected order workspace for the current status and any action requested by LIA.</p>`;
  return {subject: title, text: `${input.storeName}, a refund or return claim may require your attention. Review it securely in LIA: ${input.url}`, html: layout({title, preheader: `A claim for ${input.orderNumber} may need attention.`, body, action: {label: "Review order", url: input.url}})};
}

export function customerRefundClaimActivityEmail(input: {
  customerName: string;
  orderNumber: string;
  title: string;
  summary: string;
  url: string;
}) {
  const name = input.customerName.trim() || "Customer";
  const title = input.title.trim() || "Refund claim update";
  const summary = input.summary.trim() || "There is an update to your refund claim.";
  const body = `<div style="display:inline-block;padding:6px 10px;border-radius:999px;background:#fff7ed;color:${brandDark};font-size:12px;font-weight:800">REFUND CLAIM UPDATE</div><p style="margin:18px 0 0;line-height:1.65;color:#374151">Hi ${escapeHtml(name)}, ${escapeHtml(summary)}</p><div style="margin-top:20px;padding:14px 16px;border-radius:10px;background:#f9fafb;border:1px solid #e5e7eb"><span style="font-size:13px;color:${muted}">Order</span><div style="margin-top:4px;font-size:16px;font-weight:800;color:${ink}">${escapeHtml(input.orderNumber)}</div></div><p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:${muted}">Open the protected order page for the current claim timeline and any message from LIA Support.</p>`;
  const text = `Hi ${name}, ${summary}\n\nOrder: ${input.orderNumber}\nView the protected claim timeline: ${input.url}`;
  return {
    subject: title,
    text,
    html: layout({
      title,
      preheader: summary,
      body,
      action: {label: "View claim activity", url: input.url},
    }),
  };
}

export function driverShipdayCredentialsEmail(input: {driverName: string; email: string; temporaryPassword: string}) {
  const name = input.driverName.trim() || "Driver";
  const title = "Your LIA delivery app access";
  const body = `<div style="display:inline-block;padding:6px 10px;border-radius:999px;background:#ecfdf5;color:#047857;font-size:12px;font-weight:800">DRIVER APPROVED</div><p style="margin:18px 0 0;line-height:1.65;color:#374151">Hi ${escapeHtml(name)}, LIA approved your driver application and created your Shipday Driver account.</p><div style="margin-top:20px;padding:16px;border-radius:10px;background:#f9fafb;border:1px solid #e5e7eb"><p style="margin:0 0 8px;font-size:13px;color:${muted}">Email</p><p style="margin:0 0 16px;font-weight:800;color:${ink}">${escapeHtml(input.email)}</p><p style="margin:0 0 8px;font-size:13px;color:${muted}">Temporary password</p><p style="margin:0;font-family:monospace;font-size:17px;font-weight:800;color:${ink}">${escapeHtml(input.temporaryPassword)}</p></div><p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:${muted}">Install the Shipday Driver app, sign in with these credentials, and change the temporary password immediately. Never share it with anyone, including LIA Support.</p>`;
  const text = `Hi ${name}, your LIA driver application was approved.\n\nUse the Shipday Driver app.\nEmail: ${input.email}\nTemporary password: ${input.temporaryPassword}\n\nSign in and change this temporary password immediately. Never share it.`;
  return {subject: title, text, html: layout({title, preheader: "Your approved LIA driver account is ready for Shipday.", body})};
}

export function driverAccountActivityEmail(input: {
  driverName: string;
  title: string;
  summary: string;
  badge: string;
  actionLabel: string;
  url: string;
}) {
  const name = input.driverName.trim() || "Driver";
  const title = input.title.trim() || "Driver account update";
  const summary = input.summary.trim() || "There is an update to your LIA driver account.";
  const badge = input.badge.trim() || "DRIVER UPDATE";
  const body = `<div style="display:inline-block;padding:6px 10px;border-radius:999px;background:#fff7ed;color:${brandDark};font-size:12px;font-weight:800">${escapeHtml(badge)}</div><p style="margin:18px 0 0;line-height:1.65;color:#374151">Hi ${escapeHtml(name)}, ${escapeHtml(summary)}</p><p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:${muted}">Open your protected LIA driver workspace for the current status and additional details.</p>`;
  const text = `Hi ${name}, ${summary}\n\nOpen your protected LIA driver workspace: ${input.url}`;
  return {
    subject: title,
    text,
    html: layout({
      title,
      preheader: summary,
      body,
      action: {label: input.actionLabel, url: input.url},
    }),
  };
}
