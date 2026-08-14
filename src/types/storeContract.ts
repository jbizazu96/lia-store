export interface StoreContractSummary {
  id: string;
  fileName: string;
  sizeBytes: number;
  uploadedAt: string | null;
  uploadedByEmail: string;
  sha256: string;
}

export interface StoreContractWorkspace {
  contracts: StoreContractSummary[];
  commission: {
    basisPoints: number;
    source: "store_override" | "default";
  };
}
