/*
|--------------------------------------------------------------------------
| Admin Workspace Types
|--------------------------------------------------------------------------
*/

import type {AdminAccessProfile} from "@/types/adminAccess";

export interface AdminWorkspaceEntry {
  administrator: AdminAccessProfile;
}

export interface AdminWorkspaceOverview {
  reviewQueue: {
    pendingStoreApplications: number;
    pendingDriverApplications: number;
    pendingDeletionRequests: number;
    failedTransfers: number;
    pendingRefunds: number;
    totalStores: number;
    totalDrivers: number;
    totalCustomers: number;
    totalOrders: number;
  };
}

export type AdminApplicationStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "rejected"
  | "suspended";

export interface AdminApplicationListItem {
  id: string;
  name: string;
  city: string;
  state: string;
  status: AdminApplicationStatus;
  submittedAt: string | null;
  ownerName?: string;
}

export interface AdminApplicationCounts {
  pending_review: number;
  approved: number;
  rejected: number;
}

export interface AdminReviewDocument {
  key: string;
  label: string;
  required: boolean;
  url?: string | null;
  urls?: string[];
  expirationDate?: string | null;
  review: {
    reviewStatus: "pending" | "approved" | "rejected" | "expired";
    rejectionReason: string | null;
    reviewedAt: string | null;
    reviewedBy: string | null;
  };
}

export interface AdminStoreApplicationDetail {
  id: string;
  status: AdminApplicationStatus;
  submittedAt: string | null;
  isApproved: boolean;
  isActive: boolean;
  zoneAssignment: {homeZoneId: string | null; serviceZoneIds: string[]};
  owner: {name: string; email: string; phone: string; address: string};
  store: {name: string; email: string; phone: string; description: string; address: string; businessType: string; registeredName: string; ein: string; businessStructure: string; schedule: Array<{day: string; open: string; close: string; isClosed: boolean}>};
  merchantAgreement: {accepted: boolean; version: string | null; representativeName: string | null; acceptedByEmail: string | null; acceptedAt: string | null; manualSignatureRequired: boolean};
  stripe: {accountStatus: string; detailsSubmitted: boolean; transfersEnabled: boolean; payoutsEnabled: boolean; requiresAction: boolean};
  documents: AdminReviewDocument[];
  applicationReview: Record<string, unknown>;
}

export interface AdminDriverApplicationDetail {
  id: string;
  status: AdminApplicationStatus;
  submittedAt: string | null;
  isApproved: boolean;
  zoneAssignment: {homeZoneId: string | null; serviceZoneIds: string[]};
  profile: {name: string; email: string; phone: string; dateOfBirth: string; address: string};
  serviceArea: {city: string; state: string; preferredRadiusMiles: number | null; approvedRadiusMiles: number | null};
  vehicle: {deliveryMethod: string; make: string; model: string; year: number | null; color: string; licensePlate: string; registrationState: string};
  stripe: {accountStatus: string; detailsSubmitted: boolean; transfersEnabled: boolean; payoutsEnabled: boolean; requiresAction: boolean};
  documents: AdminReviewDocument[];
  applicationReview: Record<string, unknown>;
}

export type AdminAccountDeletionStatus =
  | "pending_review"
  | "more_information_required"
  | "approved"
  | "rejected"
  | "failed"
  | "completed";

export interface AdminAccountDeletionRequestListItem {
  id: string;
  ownerType: "customer" | "store" | "driver";
  status: AdminAccountDeletionStatus;
  reasonCode: string;
  requestedAt: string | null;
  scheduledDeletionAt: string | null;
}

export interface AdminAccountDeletionRequestCounts {
  pending_review: number;
  more_information_required: number;
  approved: number;
  rejected: number;
  failed: number;
}

export interface AdminAccountDeletionRequestDetail {
  id: string;
  ownerType: "customer" | "store" | "driver";
  owner: {
    name: string;
    email: string;
    accountStatus: string;
  };
  status: AdminAccountDeletionStatus;
  reasonCode: string;
  reasonDetails: string | null;
  requestedAt: string | null;
  scheduledDeletionAt: string | null;
  engineSupported: boolean;
  adminDecision: {
    decision: string | null;
    notes: string | null;
    decidedAt: string | null;
  };
  workflow: {
    currentStep: string;
    attemptCount: number;
    failedStep: string | null;
    lastError: string | null;
    startedAt: string | null;
    completedAt: string | null;
  };
}

export interface AdminOrderListItem {
  id: string; orderNumber: string; status: string; createdAt: string | null;
  storeName: string; customerName: string; totalAmount: number; currency: string;
  paymentStatus: string; driverName: string | null; shipdayStatus: string | null;
  exceptions: string[];
}

export interface AdminOrderDetail extends AdminOrderListItem {
  customer: {name: string; email: string | null; phone: string | null; address: string | null};
  store: {name: string; phone: string | null; address: string | null};
  delivery: {driverName: string | null; driverId: string | null; distanceMiles: number | null; estimatedMinutes: number | null; shipdayStatus: string | null; shipdayOrderId: string | null; lastSyncAt: string | null; cancellationReason: string | null};
  payment: {status: string; paidAt: string | null; currency: string};
  pricing: {currency: string; subtotalAmount: number; deliveryFeeAmount: number; serviceFeeAmount: number; taxAmount: number; tipAmount: number; totalAmount: number};
  items: Array<{name: string; quantity: number; unitPriceAmount: number; lineTotalAmount: number}>;
  history: Array<{status: string; timestamp: string | null; note: string | null}>;
}

export interface AdminFinanceOverview {
  metrics: {completedTransferAmount: number; pendingTransferAmount: number; failedTransfers: number; pendingRefunds: number};
  transfers: Array<{id: string; orderId: string; orderNumber: string | null; recipientType: string; recipientId: string; amount: number; currency: string; status: string; attemptCount: number; lastError: string | null; updatedAt: string | null; completedAt: string | null}>;
  refunds: Array<{id: string; orderId: string; orderNumber: string | null; scope: string; reason: string; amount: number; currency: string; status: string; lastError: string | null; updatedAt: string | null; completedAt: string | null}>;
  settlements: Array<{id: string; orderId: string; orderNumber: string | null; storeAmount: number; driverAmount: number; currency: string; status: string; createdAt: string | null; completedAt: string | null}>;
}

export interface AdminLiaFinanceReport {
  window: {allocationCount: number; limited: boolean};
  revenue: {grossCustomerPayments: number; grossPlatformRevenue: number; refundAmount: number; platformRefundImpact: number; stripeProcessingFees: number; netPlatformRevenue: number; salesTaxCollected: number; driverTipsCollected: number; participantTransfersCompleted: number};
  stores: Array<{
    storeId: string; storeName: string; orderCount: number;
    grossCustomerPayments: number; grossProductSales: number; salesTaxCollected: number;
    storeCommission: number; storeAllocation: number; storeRefundReversals: number; netStoreAllocation: number;
    driverAllocation: number; driverTips: number; customerRefunds: number;
    liaRevenue: number; liaRefundImpact: number; stripeProcessingFees: number; netLiaRevenue: number;
  }>;
}
export interface AdminCommissionSettings { defaultStoreCommissionBasisPoints: number; defaultDriverCommissionBasisPoints: number; stores: Array<{id: string; name: string; overrideBasisPoints: number | null}>; nextCursor: string | null; }

export interface AdminStoreApplicationPolicy {
  requiredDocuments: {
    ownerPhotoId: boolean;
    logo: boolean;
    banner: boolean;
    storeFront: boolean;
    storeInside: boolean;
  };
  requireStripeAccount: boolean;
  allowWorkspaceApprovalBeforeDocumentReview: boolean;
  requireApprovedDocumentsForActivation: boolean;
}

export interface AdminDriverApplicationPolicy {
  minimumAge: number;
  maximumPreferredRadiusMiles: number;
  requiredDocuments: {
    driversLicenseFront: boolean;
    driversLicenseBack: boolean;
    vehicleInsurance: boolean;
    vehicleRegistration: boolean;
  };
  requireStripeAccount: boolean;
  requireApprovedDocumentsForApproval: boolean;
}

export interface AdminOrderDeliveryPolicy { minutesPerMile: number; defaultPreparationMinutes: number; reminderIntervalsMinutes: {pending: number; accepted: number; preparing: number}; }

export interface AdminCustomerListItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  accountStatus: "active" | "suspended";
  createdAt: string | null;
  profileImageUrl: string | null;
}

export interface AdminCustomerDetail {
  id: string;
  profile: {
    name: string;
    email: string;
    phone: string;
    profileImageUrl: string | null;
    createdAt: string | null;
    accountStatus: "active" | "suspended";
    suspensionReason: string | null;
  };
  address: string | null;
  zoneAssignment: {homeZoneId: string | null; orderZoneIds: string[]};
  orderZoneRequests: Array<{
    id: string;
    customerAddress: string;
    requestedStoreCity: string;
    storeName: string | null;
    storeHomeZoneId: string | null;
    status: string;
    decisionMessage: string | null;
    createdAt: string | null;
  }>;
  orders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    paymentStatus: string;
    totalAmount: number;
    currency: string;
    storeName: string;
    createdAt: string | null;
  }>;
  notifications: Array<{
    id: string;
    title: string;
    body: string;
    type: string;
    read: boolean;
    createdAt: string | null;
  }>;
  deletionRequest: {
    id: string;
    status: string;
    requestedAt: string | null;
  } | null;
}

export interface AdminPlatformReport {
  periodDays: number;
  limited: boolean;
  metrics: {
    confirmedOrders: number;
    deliveredOrders: number;
    cancelledOrders: number;
    grossSalesAmount: number;
    newCustomers: number;
    activeStores: number;
    approvedDrivers: number;
    averageRouteMiles: number;
    orderZoneExceptions: number;
    customersWithoutZone: number;
    storesWithoutHomeZone: number;
    crossZoneDeliveries: number;
    peakSurchargeAmount: number;
  };
  daily: Array<{
    date: string;
    orders: number;
    customers: number;
    grossSalesAmount: number;
  }>;
  zones: Array<{
    pricingZoneId: string | null;
    pricingZoneName: string;
    orders: number;
    revenueAmount: number;
    averageRouteMiles: number;
    orderZoneExceptions: number;
    crossZoneDeliveries: number;
    peakSurchargeAmount: number;
  }>;
  zoneReportingLimited: boolean;
}

export interface AdminAuditLog {
  id: string;
  action: string;
  actor: {
    email: string;
    role: string;
    displayName: string;
  };
  target: {
    type: string;
    id: string;
  };
  reason: string | null;
  details: Record<string, string | number | boolean | null>;
  createdAt: string | null;
}

/*
|--------------------------------------------------------------------------
| Refund Claim Review
|--------------------------------------------------------------------------
|
| Claims are support records. Refund payment data remains private and is
| created only by the trusted admin callable after a decision is validated.
|
*/

export interface AdminRefundClaimListItem {
  id: string;
  orderNumber: string;
  customerName: string;
  reason: string;
  status: string;
  createdAt: string | null;
  refundId: string | null;
}

export interface AdminRefundClaimDetail {
  id: string;
  status: string;
  reason: string;
  description: string;
  createdAt: string | null;
  customer: {
    id: string;
    name: string;
    email: string | null;
  };
  order: {
    id: string;
    orderNumber: string;
    status: string;
    currency: string;
    pricing: {
      merchandiseAmount: number;
      taxAmount: number;
      deliveryFeeAmount: number;
      serviceFeeAmount: number;
      driverTipAmount: number;
      totalAmount: number;
    };
  };
  evidence: {
    imageUrl: string;
    contentType: string;
  } | null;
  decision: {
    reason: string | null;
    decidedAt: string | null;
    decidedBy: string | null;
  };
  refund: {
    id: string;
    status: string;
    amount: number;
    completedAt: string | null;
    lastError: string | null;
  } | null;
}
