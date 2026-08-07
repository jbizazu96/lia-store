/*
|--------------------------------------------------------------------------
| Driver Workspace Types
|--------------------------------------------------------------------------
|
| These are safe display models returned by authenticated driver API routes.
| They intentionally exclude identity documents, addresses, and bank details.
|
*/

export type DriverWorkspaceStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "rejected"
  | "suspended";

export interface DriverDocumentStatus {
  label: string;
  reviewStatus: "pending" | "approved" | "rejected" | "expired" | "missing";
  expirationDate?: string;
}

export interface DriverWorkspaceSummary {
  firstName: string;
  profile: DriverProfile;
  onboardingCompleted: boolean;
  onboardingStep: string;
  status: DriverWorkspaceStatus;
  isApproved: boolean;
  stripe: {
    status: string;
    transfersEnabled: boolean;
    payoutsEnabled: boolean;
    requiresAction: boolean;
  };
  documents: DriverDocumentStatus[];
  lastPayment: DriverPayment | null;
  totals: DriverPaymentTotals;
}

export interface DriverProfile {
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  address: {
    street: string;
    apartment: string;
    city: string;
    state: string;
    zip: string;
    formattedAddress: string;
  };
  serviceArea: {
    city: string;
    state: string;
    preferredRadiusMiles: number | null;
    approvedRadiusMiles: number | null;
  };
  vehicle: {
    make: string;
    model: string;
    year: number | null;
    color: string;
    licensePlate: string;
    registrationState: string;
  };
}

export interface DriverPayment {
  id: string;
  orderNumber: string | null;
  amount: number;
  status: "pending" | "paid" | "failed";
  paidAt: string | null;
  createdAt: string | null;
}

export interface DriverPaymentTotals {
  today: number;
  week: number;
  month: number;
  lifetime: number;
  pending: number;
  paid: number;
}

export interface DriverNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  read: boolean;
  createdAt: string | null;
  deepLink?: string;
}
