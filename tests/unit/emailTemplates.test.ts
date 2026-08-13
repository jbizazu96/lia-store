import {describe, expect, it} from "vitest";
import {adminActionEmail, deliveredOrderEmail, inventoryDigestEmail, newOrderEmail} from "../../functions/src/email/emailTemplates";

describe("transactional email templates", () => {
  it("creates secure deep-link calls to action", () => {
    const message = newOrderEmail({storeName: "LIA Market", orderNumber: "LIA-42", url: "https://liamarketplace.com/store/store-orders/order-42"});
    expect(message.subject).toContain("LIA-42");
    expect(message.html).toContain("https://liamarketplace.com/store/store-orders/order-42");
    expect(message.text).toContain("review and accept");
  });

  it("directs delivered customers to protected feedback", () => {
    const message = deliveredOrderEmail({
      customerName: "Customer",
      storeName: "LIA Market",
      orderNumber: "LIA-42",
      url: "https://liamarketplace.com/orders/42",
      items: [{name: "Plantain", quantity: 2, lineTotalAmount: 700, size: "2 lb"}],
      pricing: {
        currency: "usd",
        subtotalAmount: 700,
        deliveryFeeAmount: 499,
        serviceFeeAmount: 199,
        taxAmount: 50,
        tipAmount: 300,
        totalAmount: 1748,
      },
    });
    expect(message.html).toContain("delivery photo");
    expect(message.html).toContain("Receipt");
    expect(message.html).toContain("Plantain");
    expect(message.html).toContain("$17.48");
    expect(message.html).not.toContain("firebasestorage.googleapis.com");
  });

  it("escapes untrusted display values", () => {
    const message = inventoryDigestEmail({storeName: "<script>alert(1)</script>", productNames: ["<img src=x>"], url: "https://liamarketplace.com/store/products"});
    expect(message.html).not.toContain("<script>alert(1)</script>");
    expect(message.html).not.toContain("<img src=x>");
  });

  it("keeps sensitive admin details behind the workspace link", () => {
    const message = adminActionEmail({title: "Support needed", summary: "A request needs review.", url: "https://liamarketplace.com/admin/orders/42"});
    expect(message.html).toContain("protected Admin workspace");
  });
});
