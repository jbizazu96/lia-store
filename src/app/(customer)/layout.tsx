"use client";

import {
  RoleGuard,
} from "@/components/auth/RoleGuard";
import {
  CustomerOrdersProvider,
} from "@/context/CustomerOrdersContext";
import { CustomerOfflineNotice } from "@/components/customer/ui/CustomerOfflineNotice";

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
      <CustomerOrdersProvider>
        <CustomerOfflineNotice />
        {children}
      </CustomerOrdersProvider>
    </RoleGuard>
  );
}
