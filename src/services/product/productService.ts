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
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
  type Unsubscribe,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import type {
  Product,
  ProductGalleryImage,
  ProductImageVariants,
} from "@/types/product";

/** Firestore does not accept undefined values, including inside nested data. */
function removeUndefinedFields(
  data: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).flatMap(
      ([key, value]) => {
        if (value === undefined) {
          return [];
        }

        if (
          value !== null &&
          typeof value === "object" &&
          !Array.isArray(value) &&
          !(value instanceof Date)
        ) {
          return [[
            key,
            removeUndefinedFields(
              value as Record<string, unknown>
            ),
          ]];
        }

        return [[key, value]];
      }
    )
  );
}

/*
|--------------------------------------------------------------------------
| Map Product Image Variants
|--------------------------------------------------------------------------
|
| Converts Firestore imageVariants into the shared Product domain model.
|
| Legacy products may not have this field.
|
*/

function mapImageVariants(
  imageVariants: unknown
): ProductImageVariants | undefined {
  if (
    !imageVariants ||
    typeof imageVariants !==
      "object"
  ) {
    return undefined;
  }

  return imageVariants as ProductImageVariants;
}

/*
|--------------------------------------------------------------------------
| Map Product Gallery Images
|--------------------------------------------------------------------------
|
| Converts Firestore gallery data into the shared Product domain model.
|
| Legacy products may not have an images array.
|
*/

function mapProductGalleryImages(
  images: unknown
): ProductGalleryImage[] | undefined {
  if (!Array.isArray(images)) {
    return undefined;
  }

  return images
    .map(
      (
        image
      ): ProductGalleryImage | null => {
        if (
          !image ||
          typeof image !==
            "object"
        ) {
          return null;
        }

        const data =
          image as Record<
            string,
            unknown
          >;

        if (
          typeof data.id !==
            "string" ||
          !data.id.trim()
        ) {
          return null;
        }

        return {
          id:
            data.id,

          altText:
            typeof data.altText ===
              "string"
              ? data.altText
              : "",

          position:
            typeof data.position ===
              "number"
              ? data.position
              : 0,

          isPrimary:
            data.isPrimary ===
              true,

          status:
            typeof data.status ===
              "string"
              ? data.status as
                  ProductGalleryImage[
                    "status"
                  ]
              : "none",

          imageUrl:
            typeof data.imageUrl ===
              "string"
              ? data.imageUrl
              : "",

          imageVariants:
            mapImageVariants(
              data.imageVariants
            ),

          originalImagePath:
            typeof data.originalImagePath ===
              "string"
              ? data.originalImagePath
              : null,

          optimizedImagePath:
            typeof data.optimizedImagePath ===
              "string"
              ? data.optimizedImagePath
              : null,

          imageError:
            typeof data.imageError ===
              "string"
              ? data.imageError
              : null,

          createdAt:
            data.createdAt &&
            typeof data.createdAt ===
              "object" &&
            "toDate" in data.createdAt
              ? (
                  data.createdAt as {
                    toDate: () => Date;
                  }
                )
                  .toDate()
                  .toISOString()
              : typeof data.createdAt ===
                  "string"
              ? data.createdAt
              : undefined,

          updatedAt:
            data.updatedAt &&
            typeof data.updatedAt ===
              "object" &&
            "toDate" in data.updatedAt
              ? (
                  data.updatedAt as {
                    toDate: () => Date;
                  }
                )
                  .toDate()
                  .toISOString()
              : typeof data.updatedAt ===
                  "string"
              ? data.updatedAt
              : undefined,
        };
      }
    )
    .filter(
      (
        image
      ): image is ProductGalleryImage =>
        image !== null
    )
    .sort(
      (
        firstImage,
        secondImage
      ) =>
        firstImage.position -
        secondImage.position
    );
}

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
   * Number of units currently available.
   */
  stock: data.stock ?? 0,

  /**
   * Product image saleed to customers.
   */
  imageUrl: data.imageUrl ?? "",

  imageVariants:
  mapImageVariants(
    data.imageVariants
  ),
  
  images:
  mapProductGalleryImages(
    data.images
  ),

primaryImageId:
  typeof data.primaryImageId ===
    "string"
    ? data.primaryImageId
    : null,
    
  /**
   * Image pipeline fields are updated by the background image function.
   * Keeping them in the shared mapper lets real-time listeners react when
   * the optimized image is ready.
   */
  imageStatus: data.imageStatus ?? undefined,

  originalImagePath: data.originalImagePath ?? undefined,

  optimizedImagePath: data.optimizedImagePath ?? undefined,

  imageError: data.imageError ?? undefined,

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

  /**
   * Subscribe to a store's products. This is used by product listings so a
   * completed background image conversion updates the UI without a refresh.
   */
  listenToStoreProducts(
    storeId: string,
    onProducts: (products: Product[]) => void,
    onError?: (error: Error) => void
  ): Unsubscribe {
    if (!storeId.trim()) {
      onProducts([]);
      return () => undefined;
    }

    const productsQuery = query(
      collection(db, "products"),
      where("storeId", "==", storeId)
    );

    return onSnapshot(
      productsQuery,
      (snapshot) => {
        onProducts(
          snapshot.docs.map((productDocument) =>
            mapProductDocument(
              productDocument.id,
              productDocument.data()
            )
          )
        );
      },
      (listenerError) => {
        console.error(
          "Error listening to store products:",
          listenerError
        );
        onError?.(listenerError);
      }
    );
  },

  /*
  |--------------------------------------------------------------------------
  | Create Product
  |--------------------------------------------------------------------------
  */

  async createProduct(
    product: Omit<
      Product,
      "id" |
      "createdAt" |
      "updatedAt"
    >
  ): Promise<string> {
    const productData = removeUndefinedFields(product);

    const productReference =
      await addDoc(
        collection(
          db,
          "products"
        ),
        {
          ...productData,

          createdAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp(),
        }
      );

    return productReference.id;
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
| Update Product
|--------------------------------------------------------------------------
*/

async updateProduct(
  productId: string,
  updates: Partial<
    Omit<
      Product,
      "id" |
      "storeId" |
      "createdAt" |
      "updatedAt"
    >
  >
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
      ...removeUndefinedFields(updates),

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
        ...removeUndefinedFields(productData),

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
