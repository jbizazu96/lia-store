export interface AnalyticsOrderAmount {
  id: string;
  merchandise: number;
  tax: number;
}

export interface AnalyticsRefundAmount {
  orderId: string;
  merchandise: number;
  tax: number;
  storeReversal: number;
  total: number;
  completed: boolean;
}

export interface StoreAnalyticsAccounting {
  grossMerchandise: number;
  salesTax: number;
  grossStoreEntitlement: number;
  storeCommission: number;
  refundedMerchandise: number;
  refundedSalesTax: number;
  storeRefundImpact: number;
  customerRefundTotal: number;
  refundCount: number;
}

/** All inputs and outputs are integer cents from immutable payment records. */
export function calculateStoreAnalyticsAccounting(
  orders: AnalyticsOrderAmount[],
  settlementAmounts: ReadonlyMap<string, number>,
  refunds: AnalyticsRefundAmount[],
): StoreAnalyticsAccounting {
  const result: StoreAnalyticsAccounting = {
    grossMerchandise: 0,
    salesTax: 0,
    grossStoreEntitlement: 0,
    storeCommission: 0,
    refundedMerchandise: 0,
    refundedSalesTax: 0,
    storeRefundImpact: 0,
    customerRefundTotal: 0,
    refundCount: 0,
  };
  const cohort = new Set(orders.map((order) => order.id));

  orders.forEach((order) => {
    result.grossMerchandise += order.merchandise;
    result.salesTax += order.tax;
    const settlement = settlementAmounts.get(order.id);
    if (settlement !== undefined) {
      result.grossStoreEntitlement += settlement;
      result.storeCommission += Math.max(0, order.merchandise + order.tax - settlement);
    }
  });

  refunds.forEach((refund) => {
    if (!cohort.has(refund.orderId)) return;
    result.refundedMerchandise += refund.merchandise;
    result.refundedSalesTax += refund.tax;
    result.storeRefundImpact += refund.storeReversal;
    result.customerRefundTotal += refund.total;
    if (refund.completed) result.refundCount += 1;
  });

  return result;
}
