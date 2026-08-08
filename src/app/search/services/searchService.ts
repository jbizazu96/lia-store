/*
|--------------------------------------------------------------------------
| Customer Global Search
|--------------------------------------------------------------------------
|
| Searches only server-managed public catalog projections using indexed
| searchTokens. Product projections carry a small safe store summary, so a
| product result never needs a second store read.
|
*/

import {
  collection,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";
import {
  db,
} from "@/lib/firebase";
import {
  calculateDistance,
  getEstimatedTimeNumber,
} from "@/services/delivery/distance";
import {
  calculateDeliveryFee,
} from "@/services/delivery/deliveryPricing";
import {
  getStoreStatus,
  type ScheduleDay,
} from "@/services/store/storeSchedule";
import type {
  MarketplacePricingPolicy,
} from "@/services/pricing/marketplacePricingClientService";
import type {
  SearchResult,
  StoreData,
  StoreGroup,
} from "../types";

const MAXIMUM_INDEXED_RESULTS = 60;

type Data = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function number(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : 0;
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isRecord(value: unknown): value is Data {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value);
}

function schedule(value: unknown): ScheduleDay[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const data = item as Data;
    const day = text(data.day);
    const open = text(data.open);
    const close = text(data.close);

    if (!day || !open || !close) {
      return [];
    }

    return [{
      day,
      open,
      close,
      isClosed: data.isClosed === true,
    }];
  });
}

function isCustomerVisibleStore(
  data: Data
): boolean {
  return data.isApproved === true &&
    data.isActive === true;
}

function storeData(
  id: string,
  data: Data,
  userLocation: {lat: number; lng: number} | null,
  marketplacePolicy: MarketplacePricingPolicy
): StoreData {
  const latitude = number(data.latitude);
  const longitude = number(data.longitude);
  const distance = userLocation && latitude && longitude
    ? calculateDistance(
      userLocation.lat,
      userLocation.lng,
      latitude,
      longitude
    )
    : 0;
  const isOpen = getStoreStatus(
    schedule(data.schedule),
    data.isOpen === true
  ).isOpen;

  return {
    id,
    name: text(data.name) || "Store",
    logoUrl: text(data.logoUrl),
    /*
    - Keep search consistent with the store page: show only the rating
    - stored for this store. A new store without reviews remains 0 rather
    - than receiving an invented rating.
     */
    rating: number(data.rating),
    latitude,
    longitude,
    address: text(data.formattedAddress) || text(data.address),
    phone: text(data.phone),
    deliveryFee: number(data.deliveryFee) ||
      calculateDeliveryFee(
        distance,
        0,
        marketplacePolicy
      ).deliveryFee,
    estimatedPrepTime: number(data.estimatedPrepTime) ||
      getEstimatedTimeNumber(distance),
    isOpen,
  };
}

async function matchingProductDocuments(
  searchTerm: string
) {
  const reference = collection(
    db,
    "productPublicProfiles"
  );
  const indexed = await getDocs(
    query(
      reference,
      where("searchTokens", "array-contains", searchTerm),
      limit(MAXIMUM_INDEXED_RESULTS)
    )
  );

  return indexed.docs;
}

async function matchingStoreDocuments(
  searchTerm: string
) {
  const reference = collection(
    db,
    "storePublicProfiles"
  );
  const indexed = await getDocs(
    query(
      reference,
      where("searchTokens", "array-contains", searchTerm),
      limit(MAXIMUM_INDEXED_RESULTS)
    )
  );

  return indexed.docs;
}

export async function performSearch(
  searchTerm: string,
  userLocation: {lat: number; lng: number} | null,
  marketplacePolicy: MarketplacePricingPolicy
): Promise<SearchResult[]> {
  const term = normalize(searchTerm);

  if (term.length < 2) {
    return [];
  }

  try {
    const productDocuments = await matchingProductDocuments(term);
    const products = productDocuments.filter((document) => {
      const data = document.data() as Data;

      return data.isAvailable !== false &&
        number(data.stock) > 0;
    });
    return products.flatMap((document) => {
      const product = document.data() as Data;
      const storeId = text(product.storeId);
      const storeSummary = product.storeSummary;

      if (!storeId ||
        !isRecord(storeSummary) ||
        !isCustomerVisibleStore(storeSummary)
      ) {
        return [];
      }

      const store = storeData(
        storeId,
        storeSummary,
        userLocation,
        marketplacePolicy,
      );

      const distance = userLocation &&
        store.latitude &&
        store.longitude
        ? calculateDistance(
          userLocation.lat,
          userLocation.lng,
          store.latitude,
          store.longitude
        )
        : 0;

      return [{
        id: document.id,
        name: text(product.name) || "Unnamed Product",
        description: text(product.description),
        price: number(product.price),
        imageUrl: text(product.imageUrl),
        imageVariants: product.imageVariants as SearchResult["imageVariants"],
        category: text(product.category) || "Uncategorized",
        stock: number(product.stock),
        storeId,
        storeName: store.name,
        storeRating: store.rating,
        storeDistance: distance,
        deliveryFee: store.deliveryFee,
        estimatedTime: store.estimatedPrepTime,
        storeLogo: store.logoUrl,
        storeIsOpen: store.isOpen,
        storeAddress: store.address,
        storePhone: store.phone,
        storeLatitude: store.latitude,
        storeLongitude: store.longitude,
        promotion: product.promotion as SearchResult["promotion"],
        size: product.size as SearchResult["size"],
      }];
    });
  } catch (error) {
    console.error("Customer product search failed.", error);
    return [];
  }
}

export function groupResultsByStore(
  results: SearchResult[]
): StoreGroup[] {
  const groups = new Map<string, StoreGroup>();

  results.forEach((item) => {
    if (!groups.has(item.storeId)) {
      groups.set(item.storeId, {
        storeId: item.storeId,
        storeName: item.storeName,
        storeRating: item.storeRating,
        storeDistance: item.storeDistance,
        deliveryFee: item.deliveryFee,
        estimatedTime: item.estimatedTime,
        storeLogo: item.storeLogo,
        isOpen: item.storeIsOpen === true,
        storeAddress: item.storeAddress || "",
        storePhone: item.storePhone || "",
        storeLatitude: item.storeLatitude || 0,
        storeLongitude: item.storeLongitude || 0,
        products: [],
      });
    }

    groups.get(item.storeId)?.products.push(item);
  });

  return Array.from(groups.values());
}

export async function searchStoresByName(
  searchTerm: string,
  userLocation: {lat: number; lng: number} | null,
  marketplacePolicy: MarketplacePricingPolicy
): Promise<SearchResult[]> {
  const term = normalize(searchTerm);

  if (term.length < 2) {
    return [];
  }

  try {
    const stores = await matchingStoreDocuments(term);

    return stores.flatMap((document) => {
      const data = document.data() as Data;

      if (!isCustomerVisibleStore(data)) {
        return [];
      }

      const store = storeData(
        document.id,
        data,
        userLocation,
        marketplacePolicy
      );
      const distance = userLocation &&
        store.latitude &&
        store.longitude
        ? calculateDistance(
          userLocation.lat,
          userLocation.lng,
          store.latitude,
          store.longitude
        )
        : 0;

      return [{
        id: store.id,
        name: store.name,
        description: "Store",
        price: 0,
        imageUrl: store.logoUrl || "",
        category: "Store",
        stock: 0,
        storeId: store.id,
        storeName: store.name,
        storeRating: store.rating,
        storeDistance: distance,
        deliveryFee: store.deliveryFee,
        estimatedTime: store.estimatedPrepTime,
        storeLogo: store.logoUrl,
        storeIsOpen: store.isOpen,
        storeAddress: store.address,
        storePhone: store.phone,
        storeLatitude: store.latitude,
        storeLongitude: store.longitude,
      }];
    });
  } catch (error) {
    console.error("Customer store search failed.", error);
    return [];
  }
}
