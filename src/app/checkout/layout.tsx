"use client";

import {
  RoleGuard,
} from "@/components/auth/RoleGuard";
import { CustomerOfflineNotice } from "@/components/customer/ui/CustomerOfflineNotice";

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
      <CustomerOfflineNotice />
      {children}
    </RoleGuard>
  );
}
