"use client";

/*
  Customer store page.
  Fetches real products from Firestore based on store ID.
*/

import {useState, useEffect, use} from "react";
import {useRouter, useSearchParams} from "next/navigation";
import {motion, AnimatePresence} from "framer-motion";
import {doc, getDoc, collection, query, where, getDocs} from "firebase/firestore";
import {auth, db} from "@/lib/firebase";
import {useCart} from "@/context/CartContext";

// Components
import {StoreHeader} from "./components/StoreHeader";
import {StoreInfo} from "./components/StoreInfo";
import {SearchBar} from "./components/SearchBar";
import {CategoryScroll} from "./components/CategoryScroll";
import {PromoBanner} from "./components/PromoBanner";
import {ProductSection} from "./components/ProductSection";
import {ProductSkeleton} from "./components/ProductSkeleton";
import {CartButton} from "./components/CartButton";
import {ProductCard} from "./components/ProductCard";

// Types
import {Store, Category, Product} from "./types";

// Services
import {calculateDistance, getDeliveryFeeNumber, getEstimatedTimeNumber} from "@/services/distance";

interface StorePageProps {
  params: Promise<{
    storeId: string;
  }>;
}

export default function StorePage({params}: StorePageProps) {
  const {storeId} = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const {addItem} = useCart();
  
  // Get data passed from home page via URL params
  const distanceParam = searchParams.get("distance");
  const deliveryFeeParam = searchParams.get("deliveryFee");
  const estimatedTimeParam = searchParams.get("estimatedTime");
  
  const [store, setStore] = useState<Store | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<{lat: number; lng: number} | null>(null);

  // Get user location from auth
  useEffect(() => {
    const getUserLocation = async () => {
      const user = auth.currentUser;
      if (user) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          if (data.defaultAddress) {
            setUserLocation({
              lat: data.defaultAddress.latitude,
              lng: data.defaultAddress.longitude,
            });
          }
        }
      }
    };
    getUserLocation();
  }, []);

  // Fetch store data and products
  useEffect(() => {
    const fetchStoreAndProducts = async () => {
      try {
        setLoading(true);

        // 1. Get store data
        const storeRef = doc(db, "stores", storeId);
        const storeDoc = await getDoc(storeRef);

        if (!storeDoc.exists()) {
          router.push("/home");
          return;
        }

        const data = storeDoc.data();
        
        // 2. Get products for this store
        const productsRef = collection(db, "products");
        const q = query(productsRef, where("storeId", "==", storeId));
        const productsSnapshot = await getDocs(q);

        const productsData: Product[] = [];
        productsSnapshot.forEach((doc) => {
          const p = doc.data();
          productsData.push({
            id: doc.id,
            name: p.name || "Unnamed Product",
            description: p.description || "",
            price: p.price || 0,
            displayPrice: p.displayPrice || p.price || 0,
            imageUrl: p.imageUrl || "",
            category: p.category || "Uncategorized",
            stock: p.stock || 0,
            rating: p.rating || 4.5,
            reviewCount: p.reviewCount || 0,
            soldCount: p.soldCount || 0,
            brand: p.brand || "",
            size: p.size || null,
            promotion: p.promotion || null,
          });
        });

        setAllProducts(productsData);
        setFilteredProducts(productsData);

        // 3. Build categories from products
        const categoryMap = new Map<string, Category>();
        const categoryIcons: {[key: string]: string} = {
          "produce": "🥬",
          "meat": "🥩",
          "seafood": "🦞",
          "dairy": "🧀",
          "pantry": "🥫",
          "spices": "🌶️",
          "snacks": "🍿",
          "beverages": "🥤",
          "frozen": "❄️",
          "international": "🌍",
          "health": "💪",
          "household": "🏠",
        };

        productsData.forEach((product) => {
          const categoryName = product.category || "Uncategorized";
          if (!categoryMap.has(categoryName)) {
            categoryMap.set(categoryName, {
              id: categoryName.toLowerCase().replace(/\s+/g, "_"),
              name: categoryName,
              icon: categoryIcons[categoryName.toLowerCase()] || "📦",
              products: [],
            });
          }
          categoryMap.get(categoryName)!.products.push(product);
        });

        const categoriesList = Array.from(categoryMap.values());
        setCategories(categoriesList);

        // 4. Calculate distance if user location is available and not passed via URL
        let distance = parseFloat(distanceParam || "0");
        let deliveryFee = parseFloat(deliveryFeeParam || "0");
        let estimatedTime = parseInt(estimatedTimeParam || "0");

        if (!distance && userLocation && data.latitude && data.longitude) {
          distance = calculateDistance(
            userLocation.lat,
            userLocation.lng,
            data.latitude,
            data.longitude
          );
          // Use the service functions for consistent fees
          deliveryFee = getDeliveryFeeNumber(distance);
          estimatedTime = getEstimatedTimeNumber(distance);
        }

        // 5. Build store object
        const storeData: Store = {
          id: storeDoc.id,
          name: data.name || "Store",
          description: data.description || "",
          logoUrl: data.logoUrl || "",
          bannerUrl: data.bannerUrl || "",
          address: data.address || "",
          city: data.city || "",
          state: data.state || "",
          zip: data.zip || "",
          phone: data.phone || "",
          email: data.email || "",
          latitude: data.latitude || 0,
          longitude: data.longitude || 0,
          distance: distance,
          deliveryFee: deliveryFee,
          minimumOrder: data.minimumOrder || 20,
          estimatedPrepTime: data.estimatedPrepTime || estimatedTime || 15,
          isOpen: data.isOpen !== false,
          rating: data.rating || 4.5,
          reviewCount: data.reviewCount || 0,
          categories: categoriesList,
          promotions: [
            {
              id: "promo1",
              title: "Free Delivery",
              description: `On orders over $${data.minimumOrder || 20}`,
              imageUrl: "",
              type: "free_shipping",
            },
          ],
        };

        setStore(storeData);
        
      } catch (error) {
        console.error("Error fetching store:", error);
        router.push("/home");
      } finally {
        setLoading(false);
      }
    };

    fetchStoreAndProducts();
  }, [storeId, router, distanceParam, deliveryFeeParam, estimatedTimeParam, userLocation]);

  // Handle search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredProducts(allProducts);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = allProducts.filter(
      p =>
        p.name.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query) ||
        p.category.toLowerCase().includes(query)
    );
    setFilteredProducts(filtered);
  }, [searchQuery, allProducts]);

  // Handle category selection
  const handleCategorySelect = (categoryId: string) => {
    setSelectedCategory(categoryId);
    if (categoryId === "all") {
      setFilteredProducts(allProducts);
    } else {
      const category = categories.find(c => c.id === categoryId);
      setFilteredProducts(category?.products || []);
    }
  };

  // Add to cart using CartContext
  const handleAddToCart = (product: Product) => {
    if (!store) return;
    
    addItem({
      id: product.id,
      name: product.name,
      price: product.price,
      imageUrl: product.imageUrl,
      storeId: store.id,
      storeName: store.name,
      size: product.size,
    });
    
    // Optional: Show a quick feedback
    console.log("Added to cart:", product.name);
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 pb-24">
        <div className="h-56 bg-gray-200 animate-pulse" />
        <div className="px-4 -mt-8">
          <div className="w-20 h-20 rounded-full bg-gray-200 animate-pulse mx-auto" />
        </div>
        <div className="px-4 mt-4 space-y-4">
          {[1, 2, 3].map(i => (
            <ProductSkeleton key={i} />
          ))}
        </div>
      </main>
    );
  }

  if (!store) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Store not found</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-24">
      {/* Store Header */}
      <StoreHeader
        bannerUrl={store.bannerUrl}
        logoUrl={store.logoUrl}
        name={store.name}
        rating={store.rating}
        reviewCount={store.reviewCount}
        onBack={() => router.push("/home")}
      />

      {/* Store Info */}
      <div className="px-4 -mt-8 relative z-10">
        <StoreInfo
          name={store.name}
          isOpen={store.isOpen}
          distance={store.distance}
          deliveryFee={store.deliveryFee}
          estimatedPrepTime={store.estimatedPrepTime}
          minimumOrder={store.minimumOrder}
          rating={store.rating}
          reviewCount={store.reviewCount}
        />
      </div>

      {/* Promo Banner */}
      {store.promotions && store.promotions.length > 0 && (
        <div className="px-4 mt-4">
          <PromoBanner promotions={store.promotions} />
        </div>
      )}

      {/* Search Bar */}
      <div className="px-4 mt-4">
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search products..."
        />
      </div>

      {/* Categories */}
      {categories.length > 0 && (
        <div className="px-4 mt-4">
          <CategoryScroll
            categories={categories}
            selectedCategory={selectedCategory}
            onSelect={handleCategorySelect}
          />
        </div>
      )}

      {/* Products */}
      {searchQuery ? (
        <div className="px-4 mt-4">
          <h3 className="font-bold text-gray-800 mb-3">
            Search Results ({filteredProducts.length})
          </h3>
          {filteredProducts.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No products found</p>
              <p className="text-sm text-gray-400">Try adjusting your search</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onAddToCart={handleAddToCart}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        categories.map((category) => (
          <ProductSection
            key={category.id}
            category={category}
            products={category.products}
            onAddToCart={handleAddToCart}
            onViewAll={() => {
              setSelectedCategory(category.id);
              handleCategorySelect(category.id);
            }}
          />
        ))
      )}

      {/* Floating Cart Button */}
      <CartButton />
    </main>
  );
}