export interface DeliveryZoneCity {
  key: string;
  name: string;
  stateCode: string;
}

export interface DeliveryZone {
  id: string;
  name: string;
  description: string | null;
  primaryStateCode: string;
  timeZone: string;
  maximumRouteMiles: number;
  isActive: boolean;
  cities: DeliveryZoneCity[];
  postalCodes: string[];
  placeIds: string[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface DeliveryZoneDraft {
  name: string;
  description: string;
  primaryStateCode: string;
  timeZone: string;
  maximumRouteMiles: number;
  isActive: boolean;
  postalCodes: string[];
  placeIds: string[];
}
