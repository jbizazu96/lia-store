"use client";

/*
  Customer store page.
  Fetches real products from Firestore based on store ID.
  Shows distance warning if store is outside delivery radius.
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
import {DistanceWarningModal} from "./components/DistanceWarningModal";

// Types
import {Store, Category, Product} from "./types";

// Services
import {calculateDistance, getDeliveryFeeNumber, getEstimatedTimeNumber} from "@/services/delivery/distance";

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
  const [displayProducts, setDisplayProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<{lat: number; lng: number} | null>(null);

  // Distance warning modal state
  const [showDistanceWarning, setShowDistanceWarning] = useState(false);
  const [distanceValue, setDistanceValue] = useState(0);
  const [storeData, setStoreData] = useState<Store | null>(null);

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
        setDisplayProducts(productsData);

        // 3. Build categories dynamically from products
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

        // 6. Check if store is within delivery radius
        const maxRadius = 25;
        if (distance > maxRadius) {
          setDistanceValue(distance);
          setStoreData(storeData);
          setShowDistanceWarning(true);
        }
        
      } catch (error) {
        console.error("Error fetching store:", error);
        router.push("/home");
      } finally {
        setLoading(false);
      }
    };

    fetchStoreAndProducts();
  }, [storeId, router, distanceParam, deliveryFeeParam, estimatedTimeParam, userLocation]);

  // ✅ Handle filtering based on category and search
  useEffect(() => {
    // If search query is active, search across all products
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const filtered = allProducts.filter(
        p =>
          p.name.toLowerCase().includes(query) ||
          p.description.toLowerCase().includes(query) ||
          p.category.toLowerCase().includes(query)
      );
      setDisplayProducts(filtered);
      return;
    }

    // Otherwise, filter by selected category
    if (selectedCategory === "all") {
      setDisplayProducts(allProducts);
    } else {
      const category = categories.find(c => c.id === selectedCategory);
      setDisplayProducts(category?.products || []);
    }
  }, [selectedCategory, allProducts, searchQuery, categories]);

  // Handle search
  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  // ✅ Handle category selection - update selectedCategory
  const handleCategorySelect = (categoryId: string) => {
    setSelectedCategory(categoryId);
    // Clear search when selecting a category
    if (searchQuery) {
      setSearchQuery("");
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
  };

  // Handle continue to store despite distance warning
  const handleContinueToStore = () => {
    setShowDistanceWarning(false);
  };

  // Handle go back from warning modal
  const handleGoBack = () => {
    setShowDistanceWarning(false);
    router.push("/home");
  };

  /* ==========================================
     BRANDED LOADING SCREEN - WHITE THEME
  ========================================== */
  if (loading) {
    return (
      <div className="min-h-screen bg-white flex flex-col justify-center items-center relative overflow-hidden">
        
        {/* Ambient Glows (Soft Yellow accents on white background) */}
        <div className="absolute top-0 right-0 h-[500px] w-[500px] rounded-full bg-yellow-400/5 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 h-[400px] w-[400px] rounded-full bg-blue-500/5 blur-[100px] pointer-events-none" />

        {/* Centered Loader */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center justify-center p-8 relative z-10"
        >
          
          {/* Logo Orbiting Container */}
          <div className="relative w-28 h-28 mb-8 flex items-center justify-center">
            
            {/* Dotted Orbit Ring */}
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0 rounded-full border-2 border-dashed border-yellow-400/30"
            />
            
            {/* Inner Ring */}
            <motion.div 
              animate={{ rotate: -360 }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
              className="absolute inset-2 rounded-full border border-yellow-400/10"
            />
            
            {/* Rotating glowing dots */}
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0"
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-yellow-400 shadow-[0_0_15px_rgba(234,179,8,0.8)]" />
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-2 h-2 rounded-full bg-yellow-400/40" />
              <div className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-yellow-400/40" />
              <div className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-yellow-400/40" />
            </motion.div>

            {/* Central Logo Image */}
            <div className="relative w-16 h-16 z-10 bg-white/80 backdrop-blur-md rounded-full border-2 border-yellow-400/50 shadow-[0_0_30px_rgba(234,179,8,0.15)] flex items-center justify-center overflow-hidden">
              <img 
                src="/icon/icon-192.png" 
                alt="LIA Logo" 
                className="w-12 h-12 object-contain" 
              />
            </div>
          </div>

          {/* Loading Text */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="text-center"
          >
            <h3 className="text-lg font-medium text-gray-600 mb-1 tracking-wide opacity-100">
              Loading store
            </h3>
            <div className="flex items-center justify-center gap-1 mt-2">
              
              {/* Dot 1 */}
              <motion.span 
                initial={{ opacity: 0.5 }} 
                animate={{ opacity: [0.5, 1, 0.5] }} 
                transition={{ duration: 1.5, repeat: Infinity, delay: 0 }} 
                className="w-1.5 h-1.5 rounded-full bg-yellow-400"
              />
              
              {/* Dot 2 */}
              <motion.span 
                initial={{ opacity: 0.5 }} 
                animate={{ opacity: [0.5, 1, 0.5] }} 
                transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }} 
                className="w-1.5 h-1.5 rounded-full bg-yellow-400"
              />
              
              {/* Dot 3 */}
              <motion.span 
                initial={{ opacity: 0.5 }} 
                animate={{ opacity: [0.5, 1, 0.5] }} 
                transition={{ duration: 1.5, repeat: Infinity, delay: 0.6 }} 
                className="w-1.5 h-1.5 rounded-full bg-yellow-400"
              />
            </div>
          </motion.div>
          
        </motion.div>
      </div>
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
    <main className="min-h-screen bg-gray-50 pb-32">
      {/* Store Header */}
      <StoreHeader
        bannerUrl={store.bannerUrl}
        logoUrl={store.logoUrl}
        name={store.name}
        rating={store.rating}
        reviewCount={store.reviewCount}
        onBack={() => router.push("/home")} // ✅ Always go to home from store
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
          onChange={handleSearch}
          placeholder="Search products..."
        />
      </div>

      {/* Categories - Dynamic from products */}
      {categories.length > 0 && (
        <div className="px-4 mt-4">
          <CategoryScroll
            categories={categories}
            selectedCategory={selectedCategory}
            onSelect={handleCategorySelect}
          />
        </div>
      )}

      {/* Products Display */}
      {searchQuery ? (
        // Search Results
        <div className="px-4 mt-4">
          <h3 className="font-bold text-gray-800 mb-3">
            Search Results ({displayProducts.length})
          </h3>
          {displayProducts.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No products found</p>
              <p className="text-sm text-gray-400">Try adjusting your search</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {displayProducts.map((product) => (
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
        // Show products by category
        categories.map((category) => (
          <ProductSection
            key={category.id}
            category={category}
            products={category.products}
            onAddToCart={handleAddToCart}
            onViewAll={() => {
              setSelectedCategory(category.id);
              setSearchQuery("");
            }}
          />
        ))
      )}

      {/* Floating Cart Button - With extra bottom padding */}
      <CartButton />

      {/* Distance Warning Modal */}
      <AnimatePresence>
        {showDistanceWarning && storeData && (
          <DistanceWarningModal
            store={storeData}
            distance={distanceValue}
            onClose={handleGoBack}
            onContinue={handleContinueToStore}
          />
        )}
      </AnimatePresence>
    </main>
  );
}