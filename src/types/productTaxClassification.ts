export interface ProductTaxClassification {
  id: string;
  name: string;
  description: string;
  stripeTaxCode: string;
  isActive: boolean;
  requiresStoreConfirmation: boolean;
}

export interface ProductTaxClassificationDraft {
  id: string;
  name: string;
  description: string;
  stripeTaxCode: string;
  isActive: boolean;
  requiresStoreConfirmation: boolean;
}
