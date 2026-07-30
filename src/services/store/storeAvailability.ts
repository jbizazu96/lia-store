/*
  Store availability helpers.

  Approval controls private store-owner access. Activation controls public
  customer visibility.
*/
export interface StoreAvailabilityRecord {
  isApproved?: boolean;
  isActive?: boolean;
}

export function isStoreApproved(store: StoreAvailabilityRecord): boolean {
  return store.isApproved === true;
}

export function isStoreActive(store: StoreAvailabilityRecord): boolean {
  return store.isActive === true;
}

export function isStoreCustomerVisible(
  store: StoreAvailabilityRecord
): boolean {
  return isStoreApproved(store) && isStoreActive(store);
}
