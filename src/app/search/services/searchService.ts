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
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
} from "firebase/firestore";
import {
  db,
} from "@/lib/firebase";
import {getEstimatedTimeNumber} from "@/services/delivery/distance";
import {
  calculateDeliveryFee,
} from "@/services/delivery/deliveryPricing";
import {
  getStoreStatus,
  type ScheduleDay,
} from "@/services/store/storeSchedule";
import {marketplacePricingClientService} from "@/services/pricing/marketplacePricingClientService";
import {getCachedStoreDeliveryRoutes} from "@/services/delivery/deliveryRoutesClientService";
import type {
  SearchResult,
  StoreData,
  StoreGroup,
} from "../types";
import {loadCached} from "@/services/cache/clientDataCache";

const SEARCH_PAGE_SIZE = 20;

export interface MarketplaceSearchPage {
  productResults: SearchResult[];
  storeResults: SearchResult[];
  nextProductCursor: string | null;
  nextStoreCursor: string | null;
  hasMore: boolean;
}

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
): StoreData {
  const latitude = number(data.latitude);
  const longitude = number(data.longitude);
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
    deliveryFee: 0,
    estimatedPrepTime: number(data.estimatedPrepTime),
    isOpen,
  };
}

async function matchingProductDocuments(
  searchTerm: string,
  cursor?: string | null,
) {
  const reference = collection(
    db,
    "productPublicProfiles"
  );
  const constraints = [
    where("searchTokens", "array-contains", searchTerm),
    orderBy(documentId()),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(SEARCH_PAGE_SIZE + 1),
  ];
  const indexed = await getDocs(query(reference, ...constraints));

  return indexed.docs;
}

async function matchingStoreDocuments(
  searchTerm: string,
  cursor?: string | null,
) {
  const reference = collection(
    db,
    "storePublicProfiles"
  );
  const constraints = [
    where("searchTokens", "array-contains", searchTerm),
    orderBy(documentId()),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(SEARCH_PAGE_SIZE + 1),
  ];
  const indexed = await getDocs(query(reference, ...constraints));

  return indexed.docs;
}

/** Indexed, cursor-based search boundary. Results are cached briefly and
 * identical in-flight requests are deduplicated by the shared client cache. */
export async function searchMarketplacePage(
  searchTerm: string,
  cursors: {
    product?: string | null;
    store?: string | null;
    productDone?: boolean;
    storeDone?: boolean;
  } = {},
): Promise<MarketplaceSearchPage> {
  const term = normalize(searchTerm);
  if (term.length < 2) {
    return {productResults: [], storeResults: [], nextProductCursor: null, nextStoreCursor: null, hasMore: false};
  }

  return loadCached(
    `catalog-search:${term}:${cursors.product ?? "first"}:${cursors.store ?? "first"}`,
    async () => {
      const [productDocuments, storeDocuments] = await Promise.all([
        cursors.productDone ? Promise.resolve([]) : matchingProductDocuments(term, cursors.product),
        cursors.storeDone ? Promise.resolve([]) : matchingStoreDocuments(term, cursors.store),
      ]);
      const productPage = productDocuments.slice(0, SEARCH_PAGE_SIZE);
      const storePage = storeDocuments.slice(0, SEARCH_PAGE_SIZE);
      const productResults = await mapProductDocuments(productPage);
      const storeResults = mapStoreDocuments(storePage);
      const productHasMore = productDocuments.length > SEARCH_PAGE_SIZE;
      const storeHasMore = storeDocuments.length > SEARCH_PAGE_SIZE;
      return {
        productResults,
        storeResults,
        nextProductCursor: productHasMore ? productPage.at(-1)?.id ?? null : null,
        nextStoreCursor: storeHasMore ? storePage.at(-1)?.id ?? null : null,
        hasMore: productHasMore || storeHasMore,
      };
    },
    {ttlMs: 30_000, scope: "public"},
  );
}

function mapProductDocuments(
  documents: Awaited<ReturnType<typeof matchingProductDocuments>>,
): SearchResult[] {
  return documents.filter((document) => {
    const data = document.data() as Data;
    return data.isAvailable !== false && number(data.stock) > 0;
  }).flatMap((document) => {
    const product = document.data() as Data;
    const storeId = text(product.storeId);
    const storeSummary = product.storeSummary;
    if (!storeId || !isRecord(storeSummary) || !isCustomerVisibleStore(storeSummary)) return [];
    const store = storeData(storeId, storeSummary);
    return [{
      resultType: "product" as const,
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
      storeDistance: 0,
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
}

function mapStoreDocuments(
  documents: Awaited<ReturnType<typeof matchingStoreDocuments>>,
): SearchResult[] {
  return documents.flatMap((document) => {
    const data = document.data() as Data;
    if (!isCustomerVisibleStore(data)) return [];
    const store = storeData(document.id, data);
    return [{
      resultType: "store" as const,
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
      storeDistance: 0,
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
}

export async function performSearch(
  searchTerm: string,
): Promise<SearchResult[]> {
  const term = normalize(searchTerm);

  if (term.length < 2) {
    return [];
  }

  try {
    const productDocuments = await matchingProductDocuments(term);
    return mapProductDocuments(productDocuments.slice(0, SEARCH_PAGE_SIZE));
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
): Promise<SearchResult[]> {
  const term = normalize(searchTerm);

  if (term.length < 2) {
    return [];
  }

  try {
    const stores = await matchingStoreDocuments(term);

    return mapStoreDocuments(stores.slice(0, SEARCH_PAGE_SIZE));
  } catch (error) {
    console.error("Customer store search failed.", error);
    return [];
  }
}

/** Apply the same zone decision, driving route, peak policy, and delivery
 * estimate used by Home to all Search results in one batched pass. */
export async function enrichSearchResults(
  results: SearchResult[],
  userLocation: {lat: number; lng: number} | null,
): Promise<SearchResult[]> {
  if (results.length === 0) return [];

  const stores = new Map<string, {
    id: string;
    latitude: number;
    longitude: number;
  }>();
  results.forEach((result) => {
    if (result.storeLatitude && result.storeLongitude) {
      stores.set(result.storeId, {
        id: result.storeId,
        latitude: result.storeLatitude,
        longitude: result.storeLongitude,
      });
    }
  });

  const storeIds = [...new Set(results.map((result) => result.storeId))];
  const [bootstrap, routes] = await Promise.all([
    marketplacePricingClientService.getHomeBootstrap(storeIds),
    userLocation && stores.size > 0
      ? getCachedStoreDeliveryRoutes(
          [...stores.values()],
          {latitude: userLocation.lat, longitude: userLocation.lng},
        )
      : Promise.resolve([]),
  ]);
  const distanceByStoreId = new Map(
    routes.map((route) => [route.storeId, route.distanceMiles]),
  );

  return results.flatMap((result) => {
    const distance = distanceByStoreId.get(result.storeId);
    if (userLocation && distance === undefined) return [];
    const applicable = bootstrap.byStoreId[result.storeId];
    const policy = applicable?.policy ?? bootstrap.policy;
    const isOrderZone =
      applicable?.decision?.zoneAccessType === "customer_order_zone";
    const routeDistance = distance ?? 0;
    const deliveryFee = calculateDeliveryFee(
      routeDistance,
      0,
      policy,
      policy.peakSurchargeEnabled,
      !isOrderZone,
    ).deliveryFee;

    return [{
      ...result,
      storeDistance: routeDistance,
      deliveryFee,
      estimatedTime: getEstimatedTimeNumber(
        routeDistance,
        bootstrap.orderDeliveryPolicy,
      ),
      zoneAccessAllowed: applicable?.decision?.allowed ?? true,
      zoneAccessType: applicable?.decision?.zoneAccessType ?? "default_pricing",
      pickupZoneAccessAllowed: applicable?.pickupDecision?.allowed ?? false,
      storePickupEnabled: applicable?.storePickupEnabled ?? false,
    }];
  });
}
