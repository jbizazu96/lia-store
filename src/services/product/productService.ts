/*
|--------------------------------------------------------------------------
| Product Service
|--------------------------------------------------------------------------
|
| Responsible for retrieving Product domain models from Firestore.
|
| Pages and components should not access the "products" collection
| directly. They should call this service instead.
|
*/

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import type { Product } from "@/types/product";

/**
 * Convert raw Firestore data into the shared Product domain model.
 *
 * All product queries use this mapper so every page receives
 * products with the same structure and fallback values.
 */
function mapProductDocument(
  productId: string,
  data: DocumentData
): Product {
  return {
  /**
   * Firestore document ID.
   */
  id: productId,

  /**
   * Store that owns this product.
   */
  storeId: data.storeId ?? "",

  /**
   * Product information.
   */
  name: data.name ?? "Unnamed Product",

  description: data.description ?? "",

  category: data.category ?? "Uncategorized",

  /**
   * Manufacturer or brand.
   *
   * Example:
   * • Coca-Cola
   * • Nestlé
   * • Maggi
   */
  brand: data.brand ?? undefined,

  /**
   * Selling price.
   */
  price: data.price ?? 0,

  /**
   * Use the standard price when legacy products do not yet have a
   * customer display price.
   */
  displayPrice: data.displayPrice ?? data.price ?? 0,

  /**
   * Number of units currently available.
   */
  stock: data.stock ?? 0,

  /**
   * Product image displayed to customers.
   */
  imageUrl: data.imageUrl ?? "",

  /**
   * Internal inventory SKU.
   */
  sku: data.sku ?? "",

  /**
   * Whether customers can purchase this product.
   */
  isAvailable: data.isAvailable ?? true,

  /**
   * Featured products appear first throughout the app.
   */
  featured: data.featured ?? false,

  /**
   * Product package size.
   *
   * Examples:
   * • 5 lb
   * • 500 ml
   * • 12 oz
   */
  size: data.size ?? null,

  /**
   * Average customer rating.
   */
  rating: data.rating ?? undefined,

  /**
   * Number of customer reviews.
   */
  reviewCount: data.reviewCount ?? 0,

  /**
   * Number of units sold.
   *
   * Used for:
   * • Best Sellers
   * • Trending Products
   * • Analytics
   */
  soldCount: data.soldCount ?? 0,

  /**
   * Active promotion attached to this product.
   *
   * Null means no promotion.
   */
  promotion: data.promotion ?? null,

  /**
   * Creation timestamp.
   *
   * Firestore stores a Timestamp.
   * Our Product domain stores an ISO string.
   */
  createdAt:
    data.createdAt?.toDate?.()?.toISOString?.() ??
    data.createdAt ??
    "",

  /**
   * Last update timestamp.
   */
  updatedAt:
    data.updatedAt?.toDate?.()?.toISOString?.() ??
    data.updatedAt ??
    "",
};
}

/**
 * Product service used throughout the application.
 */
export const productService = {
  /**
   * Get one product by its Firestore document ID.
   */
  async getProduct(
    productId: string
  ): Promise<Product | null> {
    if (!productId.trim()) {
      throw new Error(
        "A product ID is required."
      );
    }

    const snapshot = await getDoc(
      doc(db, "products", productId)
    );

    if (!snapshot.exists()) {
      return null;
    }

    return mapProductDocument(
      snapshot.id,
      snapshot.data()
    );
  },

  /**
   * Get every product belonging to one store.
   */
  async getStoreProducts(
    storeId: string
  ): Promise<Product[]> {
    if (!storeId.trim()) {
      return [];
    }

    const productsQuery = query(
      collection(db, "products"),
      where("storeId", "==", storeId)
    );

    const snapshot = await getDocs(
      productsQuery
    );

    return snapshot.docs.map(
      (productDocument) =>
        mapProductDocument(
          productDocument.id,
          productDocument.data()
        )
    );
  },

  /*
|--------------------------------------------------------------------------
| Update Product Availability
|--------------------------------------------------------------------------
*/

async updateAvailability(
  productId: string,
  isAvailable: boolean
): Promise<void> {
  if (!productId.trim()) {
    throw new Error(
      "A product ID is required."
    );
  }

  await updateDoc(
    doc(
      db,
      "products",
      productId
    ),
    {
      isAvailable,
      updatedAt:
        serverTimestamp(),
    }
  );
},

/*
|--------------------------------------------------------------------------
| Update Featured Status
|--------------------------------------------------------------------------
*/

async updateFeatured(
  productId: string,
  featured: boolean
): Promise<void> {
  if (!productId.trim()) {
    throw new Error(
      "A product ID is required."
    );
  }

  await updateDoc(
    doc(
      db,
      "products",
      productId
    ),
    {
      featured,
      updatedAt:
        serverTimestamp(),
    }
  );
},

/*
|--------------------------------------------------------------------------
| Delete Product
|--------------------------------------------------------------------------
*/

async deleteProduct(
  productId: string
): Promise<void> {
  if (!productId.trim()) {
    throw new Error(
      "A product ID is required."
    );
  }

  await deleteDoc(
    doc(
      db,
      "products",
      productId
    )
  );
},

/*
|--------------------------------------------------------------------------
| Duplicate Product
|--------------------------------------------------------------------------
*/

async duplicateProduct(
  product: Product
): Promise<string> {
  const {
    id: _id,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...productData
  } = product;

  const duplicateReference =
    await addDoc(
      collection(
        db,
        "products"
      ),
      {
        ...productData,

        name:
          `${product.name} (Copy)`,

        isAvailable: false,

        featured: false,

        createdAt:
          serverTimestamp(),

        updatedAt:
          serverTimestamp(),
      }
    );

  return duplicateReference.id;
},

  /**
   * Get available products belonging to one store.
   *
   * Filtering happens after retrieval so this method does not require
   * an additional Firestore composite index.
   */
  async getAvailableStoreProducts(
    storeId: string
  ): Promise<Product[]> {
    const products =
      await this.getStoreProducts(storeId);

    return products.filter(
      (product) =>
        product.isAvailable &&
        product.stock > 0
    );
  },

  /**
   * Get all products.
   *
   * This will be useful for the future admin panel, search,
   * reporting, and inventory tools.
   */
  async getProducts(): Promise<Product[]> {
    const snapshot = await getDocs(
      collection(db, "products")
    );

    return snapshot.docs.map(
      (productDocument) =>
        mapProductDocument(
          productDocument.id,
          productDocument.data()
        )
    );
  },
};
