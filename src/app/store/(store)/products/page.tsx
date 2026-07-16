"use client";

/*
  Main products management page.
*/
import {BrandedLoader} from "@/components/ui/BrandedLoader";
import {useState, useEffect, useCallback} from "react";
import {useRouter} from "next/navigation";
import {motion, AnimatePresence} from "framer-motion";
import {Plus, Package, AlertCircle, Filter} from "lucide-react";
import Link from "next/link";

// Firebase imports
import {auth, db} from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";

// Components
import {ProductStats} from "./components/ProductStats";
import {ProductFilters} from "./components/ProductFilters";
import {ProductCard} from "./components/ProductCard";
import {ProductSkeleton} from "./components/ProductSkeleton";

// Types
import {Product} from "./types";

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [storeId, setStoreId] = useState("");

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  /*
    Fetch products from Firestore.
  */
  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      const user = auth.currentUser;
      if (!user) return;

      // Get store ID from user document
      const userDoc = await getDoc(doc(db, "users", user.uid));
      const storeId = userDoc.data()?.storeId;

      if (!storeId) {
        router.push("/store/create");
        return;
      }

      setStoreId(storeId);

      // Query products for this store
      const productsRef = collection(db, "products");
      const q = query(productsRef, where("storeId", "==", storeId));
      const snapshot = await getDocs(q);

      const productsData: Product[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        productsData.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
          updatedAt: data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        } as Product);
      });

      setProducts(productsData);
      setFilteredProducts(productsData);
    } catch (error) {
      console.error("Error fetching products:", error);
    } finally {
      setLoading(false);
    }
  }, [router]);

  // Initial fetch
  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  /*
    Filter products.
  */
  useEffect(() => {
    let filtered = products;

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query) ||
          p.category.toLowerCase().includes(query)
      );
    }

    // Category filter
    if (categoryFilter !== "all") {
      filtered = filtered.filter((p) => p.category === categoryFilter);
    }

    // Status filter
    if (statusFilter === "active") {
      filtered = filtered.filter((p) => p.isActive);
    } else if (statusFilter === "inactive") {
      filtered = filtered.filter((p) => !p.isActive);
    }

    setFilteredProducts(filtered);
  }, [searchQuery, categoryFilter, statusFilter, products]);

  /*
    Toggle product active status.
  */
  const toggleProductActive = async (productId: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, "products", productId), {
        isActive: !currentStatus,
        updatedAt: serverTimestamp(),
      });

      setProducts((prev) =>
        prev.map((p) =>
          p.id === productId ? { ...p, isActive: !currentStatus } : p
        )
      );
    } catch (error) {
      console.error("Error toggling product status:", error);
      alert("Failed to update product status");
    }
  };

  /*
    Toggle product featured status.
  */
  const toggleProductFeatured = async (productId: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, "products", productId), {
        isFeatured: !currentStatus,
        updatedAt: serverTimestamp(),
      });

      setProducts((prev) =>
        prev.map((p) =>
          p.id === productId ? { ...p, isFeatured: !currentStatus } : p
        )
      );
    } catch (error) {
      console.error("Error toggling featured status:", error);
      alert("Failed to update featured status");
    }
  };

  /*
    Delete product with confirmation.
  */
  const deleteProduct = async (productId: string) => {
    if (!confirm("Are you sure you want to delete this product? This action cannot be undone.")) {
      return;
    }

    try {
      await deleteDoc(doc(db, "products", productId));
      setProducts((prev) => prev.filter((p) => p.id !== productId));
    } catch (error) {
      console.error("Error deleting product:", error);
      alert("Failed to delete product");
    }
  };

  /*
    Duplicate product.
  */
  const duplicateProduct = async (product: Product) => {
    try {
      const { id, createdAt, updatedAt, ...productData } = product;
      
      await addDoc(collection(db, "products"), {
        ...productData,
        name: `${product.name} (Copy)`,
        isActive: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await fetchProducts();
    } catch (error) {
      console.error("Error duplicating product:", error);
      alert("Failed to duplicate product");
    }
  };

  /*
    Calculate stats - including total stock.
  */
  const stats = {
    totalProducts: products.length,
    activeProducts: products.filter((p) => p.isActive).length,
    featuredProducts: products.filter((p) => p.isFeatured).length,
    totalStock: products.reduce((sum, p) => sum + (p.stock || 0), 0), // ✅ Calculate total stock
    totalValue: products.reduce((sum, p) => sum + (p.price * p.stock), 0),
  };

  /* ==========================================
     LOADING STATE - WHITE BRANDED LOADER
  ========================================== */
  if (loading) {
    return <BrandedLoader message="Loading products" />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Products</h1>
          <p className="text-gray-500 text-sm">Manage your store inventory</p>
        </div>
        <Link
          href="/store/products/add"
          className="px-4 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl font-semibold hover:shadow-lg hover:from-orange-600 hover:to-orange-700 transition flex items-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" />
          Add Product
        </Link>
      </div>

      {/* Stats */}
      <ProductStats {...stats} />

      {/* Filters */}
      <ProductFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        categoryFilter={categoryFilter}
        onCategoryChange={setCategoryFilter}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
      />

      {/* Products Grid */}
      {filteredProducts.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-gray-100">
          <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 text-lg font-medium">No products found</p>
          <p className="text-gray-400 text-sm mt-1">
            {searchQuery || categoryFilter !== "all" || statusFilter !== "all"
              ? "Try adjusting your filters"
              : "Start adding products to your store"}
          </p>
          {(searchQuery || categoryFilter !== "all" || statusFilter !== "all") ? (
            <button
              onClick={() => {
                setSearchQuery("");
                setCategoryFilter("all");
                setStatusFilter("all");
              }}
              className="mt-4 text-sm text-orange-600 hover:text-orange-700 font-medium"
            >
              Clear all filters
            </button>
          ) : (
            <Link
              href="/store/products/add"
              className="inline-block mt-4 px-6 py-3 bg-orange-500 text-white rounded-xl font-semibold hover:bg-orange-600 transition"
            >
              Add Your First Product
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{filteredProducts.length} products</span>
            <span className="text-green-600">
              {filteredProducts.filter((p) => p.isActive).length} active
            </span>
          </div>
          
          {/* Grid Layout - 3 columns on mobile, 4 on tablet, 5 on desktop */}
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
            <AnimatePresence initial={false} mode="popLayout">
              {filteredProducts.map((product) => (
                <motion.div
                  key={product.id}
                  initial={{opacity: 0, scale: 0.95}}
                  animate={{opacity: 1, scale: 1}}
                  exit={{opacity: 0, scale: 0.9}}
                  transition={{duration: 0.2}}
                >
                  <ProductCard
                    product={product}
                    onToggleActive={toggleProductActive}
                    onToggleFeatured={toggleProductFeatured}
                    onDelete={deleteProduct}
                    onDuplicate={duplicateProduct}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  );
}