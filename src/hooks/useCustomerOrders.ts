/*
 * Compatibility hook for the customer Orders screen. The screen owns its
 * paginated history read; shared navigation state lives in the context.
 */

export {
  useCustomerOrderHistory as useCustomerOrders,
} from "@/hooks/useCustomerOrderHistory";
