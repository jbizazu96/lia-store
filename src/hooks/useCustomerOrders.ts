/*
 * Compatibility hook for customer screens. The actual real-time listener is
 * owned once by CustomerOrdersProvider in the customer route layout.
 */

export {
  useCustomerOrdersContext as useCustomerOrders,
} from "@/context/CustomerOrdersContext";
