"use client";

import {createContext, useContext} from "react";
import type {AdminAccessProfile, AdminPermission} from "@/types/adminAccess";
import {adminCanWrite, adminHasPermission} from "@/types/adminAccess";

interface AdminAccessContextValue {
  administrator: AdminAccessProfile;
  can: (permission: AdminPermission) => boolean;
  canWrite: (permission: AdminPermission) => boolean;
  isMaster: boolean;
}

const AdminAccessContext = createContext<AdminAccessContextValue | null>(null);

export function AdminAccessProvider({administrator, children}: {administrator: AdminAccessProfile; children: React.ReactNode}) {
  return (
    <AdminAccessContext.Provider value={{
      administrator,
      can: (permission) => adminHasPermission(administrator, permission),
      canWrite: (permission) => adminCanWrite(administrator, permission),
      isMaster: administrator.role === "master_admin",
    }}>
      {children}
    </AdminAccessContext.Provider>
  );
}

export function useAdminAccess(): AdminAccessContextValue {
  const context = useContext(AdminAccessContext);
  if (!context) throw new Error("useAdminAccess must be used inside AdminAccessProvider.");
  return context;
}
