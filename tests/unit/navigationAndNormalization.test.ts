import {describe, expect, it} from "vitest";
import {normalizeUsStateCode} from "../../functions/src/common/usStateCodes";
import {
  isNativeCustomerPath,
  nativeCustomerDestination,
} from "@/services/navigation/nativeCustomerRoutes";
import {
  customerNotificationPath,
  toSafeLiaPath,
} from "@/services/notification/notificationDeepLink";

describe("US state normalization", () => {
  it("normalizes valid two-letter state codes", () => {
    expect(normalizeUsStateCode(" ia ")).toBe("IA");
    expect(normalizeUsStateCode("dc")).toBe("DC");
  });

  it("rejects names and invalid state codes", () => {
    expect(normalizeUsStateCode("Iowa")).toBeNull();
    expect(normalizeUsStateCode("XX")).toBeNull();
  });
});

describe("customer-only native navigation", () => {
  it.each(["/home", "/orders/order-1", "/product/product-1", "/store/store-1", "/store/store-1/category/rice"])("allows %s", (path) => {
    expect(isNativeCustomerPath(path)).toBe(true);
  });

  it.each(["/admin", "/driver/dashboard", "/store/dashboard", "//evil.example", "/orders/a/b"])("blocks %s", (path) => {
    expect(isNativeCustomerPath(path)).toBe(false);
    expect(nativeCustomerDestination(path)).toBe("/home");
  });

  it("preserves safe query and hash values", () => {
    expect(nativeCustomerDestination("/search?q=rice#results")).toBe("/search?q=rice#results");
  });
});

describe("notification deep links", () => {
  it("prefers the structured order ID for old malformed links", () => {
    expect(customerNotificationPath("/orders/order-1/order-1", "order-1"))
      .toBe("/orders/order-1");
  });

  it("rejects an unsafe structured order ID", () => {
    expect(customerNotificationPath("/orders", "../admin")).toBe("/orders");
  });

  it("converts the LIA custom scheme to an internal path", () => {
    expect(toSafeLiaPath("lia://orders/order-1")).toBe("/orders/order-1");
  });

  it("rejects unrelated external origins", () => {
    expect(toSafeLiaPath("https://example.com/admin")).toBeNull();
  });
});
