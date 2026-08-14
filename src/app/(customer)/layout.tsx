"use client";

import {
  RoleGuard,
} from "@/components/auth/RoleGuard";
import {
  CustomerOrdersProvider,
} from "@/context/CustomerOrdersContext";
import { CustomerOfflineNotice } from "@/components/customer/ui/CustomerOfflineNotice";
import {CustomerPushPermissionPrompt} from "@/components/customer/native/CustomerPushPermissionPrompt";
import {CustomerTermsGate} from "@/components/customer/legal/CustomerTermsGate";

export default function CustomerLayout({
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
        <CustomerOrdersProvider>
          <CustomerOfflineNotice />
          <CustomerPushPermissionPrompt />
          {children}
        </CustomerOrdersProvider>
      </CustomerTermsGate>
    </RoleGuard>
  );
}
