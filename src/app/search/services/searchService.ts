/*
  Search service for querying Firestore.
  Only shows products that match the search query, not all products from the store.
*/

import {
  collection,
  query as firestoreQuery,
  where,
  getDocs,
  or,
  doc,
  getDoc,
} from "firebase/firestore";
import {db} from "@/lib/firebase";
import {SearchResult, StoreData, StoreGroup} from "../types";
import {calculateDistance, getDeliveryFeeNumber, getEstimatedTimeNumber} from "@/services/distance";

export async function performSearch(
  searchTerm: string,
  userLocation: {lat: number; lng: number} | null
): Promise<SearchResult[]> {
  if (!searchTerm.trim() || searchTerm.trim().length < 2) {
    return [];
  }

  const term = searchTerm.trim().toLowerCase();

  try {
    // 1. Search products by name, description, or category
    const productsRef = collection(db, "products");
    
    const productQuery = firestoreQuery(
      productsRef,
      or(
        where("name", ">=", term),
        where("name", "<=", term + "\uf8ff"),
        where("description", ">=", term),
        where("description", "<=", term + "\uf8ff"),
        where("category", ">=", term),
        where("category", "<=", term + "\uf8ff")
      )
    );

    const productsSnapshot = await getDocs(productQuery);
    
    // ✅ Get ONLY the products that match the search
    const matchingProducts: any[] = [];
    const storeIds = new Set<string>();

    productsSnapshot.forEach((doc) => {
      const data = doc.data();
      const storeId = data.storeId;
      if (storeId) {
        // ✅ Only add matching products
        matchingProducts.push({
          id: doc.id,
          ...data,
        });
        storeIds.add(storeId);
      }
    });

    // 2. If no products found, try searching stores directly
    if (storeIds.size === 0) {
      const storesRef = collection(db, "stores");
      const storeQuery = firestoreQuery(
        storesRef,
        or(
          where("name", ">=", term),
          where("name", "<=", term + "\uf8ff"),
          where("city", ">=", term),
          where("city", "<=", term + "\uf8ff")
        )
      );
      const storesSnapshot = await getDocs(storeQuery);
      
      storesSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.status === "active" && data.isOpen) {
          storeIds.add(doc.id);
        }
      });
    }

    // 3. Get store details for each store ID
    const storeDataMap = new Map<string, StoreData>();
    for (const storeId of storeIds) {
      const storeRef = doc(db, "stores", storeId);
      const storeDoc = await getDoc(storeRef);
      if (storeDoc.exists()) {
        const data = storeDoc.data();
        if (data.status === "active" && data.isOpen) {
          let distance = 0;
          if (userLocation && data.latitude && data.longitude) {
            distance = calculateDistance(
              userLocation.lat,
              userLocation.lng,
              data.latitude,
              data.longitude
            );
          }
          
          storeDataMap.set(storeId, {
            id: storeDoc.id,
            name: data.name || "Store",
            logoUrl: data.logoUrl || "",
            rating: data.rating || 4.5,
            latitude: data.latitude || 0,
            longitude: data.longitude || 0,
            deliveryFee: data.deliveryFee || getDeliveryFeeNumber(distance),
            estimatedPrepTime: data.estimatedPrepTime || getEstimatedTimeNumber(distance),
            isOpen: data.isOpen !== false,
            status: data.status || "pending",
          });
        }
      }
    }

    // 4. ✅ Build search results using ONLY matching products
    const searchResults: SearchResult[] = [];
    
    // Group matching products by store
    const productMap = new Map<string, any[]>();
    matchingProducts.forEach((product) => {
      const storeId = product.storeId;
      if (!productMap.has(storeId)) {
        productMap.set(storeId, []);
      }
      productMap.get(storeId)!.push(product);
    });

    // Build results for each store with its matching products
    for (const [storeId, products] of productMap) {
      const storeData = storeDataMap.get(storeId);
      if (!storeData) continue;

      const distance = userLocation && storeData.latitude && storeData.longitude
        ? calculateDistance(
            userLocation.lat,
            userLocation.lng,
            storeData.latitude,
            storeData.longitude
          )
        : 0;

      // ✅ Only add the matching products, not all products from the store
      products.forEach((product: any) => {
        searchResults.push({
          id: product.id,
          name: product.name || "Unnamed Product",
          description: product.description || "",
          price: product.price || 0,
          imageUrl: product.imageUrl || "",
          category: product.category || "Uncategorized",
          stock: product.stock || 0,
          storeId: storeId,
          storeName: storeData.name,
          storeRating: storeData.rating,
          storeDistance: distance,
          deliveryFee: storeData.deliveryFee,
          estimatedTime: storeData.estimatedPrepTime,
          storeLogo: storeData.logoUrl,
          promotion: product.promotion || null,
          size: product.size || null,
        });
      });
    }

    return searchResults;

  } catch (error) {
    console.error("Error searching:", error);
    return [];
  }
}

export function groupResultsByStore(results: SearchResult[]): StoreGroup[] {
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
        products: [],
      });
    }
    groups.get(item.storeId)!.products.push(item);
  });
  
  return Array.from(groups.values());
}

// ✅ New function: Search stores directly by name
export async function searchStoresByName(
  searchTerm: string,
  userLocation: {lat: number; lng: number} | null
): Promise<SearchResult[]> {
  if (!searchTerm.trim() || searchTerm.trim().length < 2) {
    return [];
  }

  const term = searchTerm.trim().toLowerCase();

  try {
    const storesRef = collection(db, "stores");
    const storeQuery = firestoreQuery(
      storesRef,
      or(
        where("name", ">=", term),
        where("name", "<=", term + "\uf8ff"),
        where("city", ">=", term),
        where("city", "<=", term + "\uf8ff")
      )
    );
    
    const storesSnapshot = await getDocs(storeQuery);
    const results: SearchResult[] = [];

    for (const doc of storesSnapshot.docs) {
      const data = doc.data();
      if (data.status === "active" && data.isOpen) {
        let distance = 0;
        if (userLocation && data.latitude && data.longitude) {
          distance = calculateDistance(
            userLocation.lat,
            userLocation.lng,
            data.latitude,
            data.longitude
          );
        }

        // Add store as a result with empty products array
        // This will show the store even if it has no matching products
        results.push({
          id: doc.id,
          name: data.name || "Store",
          description: "Store",
          price: 0,
          imageUrl: data.logoUrl || "",
          category: "Store",
          stock: 0,
          storeId: doc.id,
          storeName: data.name || "Store",
          storeRating: data.rating || 4.5,
          storeDistance: distance,
          deliveryFee: data.deliveryFee || getDeliveryFeeNumber(distance),
          estimatedTime: data.estimatedPrepTime || getEstimatedTimeNumber(distance),
          storeLogo: data.logoUrl || "",
          //promotion: null,
          //size: null,
        });
      }
    }

    return results;
  } catch (error) {
    console.error("Error searching stores:", error);
    return [];
  }
}