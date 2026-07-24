"use client";

import {
  RoleGuard,
} from "@/components/auth/RoleGuard";

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
      {children}
    </RoleGuard>
  );
}
