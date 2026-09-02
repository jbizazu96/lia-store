"use client";

import {
  RoleGuard,
} from "@/components/auth/RoleGuard";
import { CustomerOfflineNotice } from "@/components/customer/ui/CustomerOfflineNotice";
import {CustomerTermsGate} from "@/components/customer/legal/CustomerTermsGate";

export default function CheckoutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard
      allowedAccountTypes={[
        "customer",
      ]}
    >
      <CustomerTermsGate>
        <CustomerOfflineNotice />
        {children}
      </CustomerTermsGate>
    </RoleGuard>
  );
}
