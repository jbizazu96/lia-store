import {defineConfig} from "vitest/config";
import {fileURLToPath} from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "coverage/unit",
      include: [
        "src/services/delivery/deliveryPricing.ts",
        "src/services/navigation/nativeCustomerRoutes.ts",
        "src/services/notification/notificationDeepLink.ts",
        "functions/src/payment/pricing/zonePricingResolutionService.ts",
        "functions/src/payment/marketplace/paymentAllocationService.ts",
        "functions/src/payment/marketplace/paymentRefundAllocationService.ts",
        "functions/src/common/usStateCodes.ts",
        "functions/src/orders/orderStatusTransitions.ts",
      ],
    },
  },
});
