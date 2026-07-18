"use client";


import {
  doc,
  getDoc,
} from "firebase/firestore";
import { storeMapper } from "@/mappers/storeMapper";
import { storeService } from "@/services/store/storeService";
import {useState, useEffect, use} from "react";
import {useRouter, useSearchParams} from "next/navigation";
import {motion, AnimatePresence} from "framer-motion";
import {auth, db} from "@/lib/firebase";
import {useCart} from "@/context/CartContext";
import { productService } from "@/services/product/productService";
import { DELIVERY_CONFIG } from "@/config/delivery";

// Components
import {StoreHeader} from "@/components/customer/store/StoreHeader";
import {StoreInfo} from "@/components/customer/store/StoreInfo";
import {CategoryScroll} from "@/components/customer/store/CategoryScroll";
import {PromoBanner} from "@/components/customer/store/PromoBanner";
import {ProductSection} from "@/components/customer/store/ProductSection";
import {ProductCard} from "@/components/customer/store/ProductCard";
import {DistanceWarningModal} from "@/components/customer/store/DistanceWarningModal";
import {BottomBar} from "@/components/customer/store/BottomBar";

// Types
import type { Category } from "@/types/category";
import type { Product } from "@/types/product";
import type { CustomerStore } from "@/types/view-models/customerStore";

// Services
import {
  calculateDeliveryFee,
  getDeliveryFeeDisplay,
} from "@/services/delivery/deliveryPricing";
import {
  calculateDistance,
  getEstimatedTime,
  getEstimatedTimeNumber,
} from "@/services/delivery/distance";

interface StorePageProps {
  params: Promise<{
    storeId: string;
  }>;
}

export default function StorePage({params}: StorePageProps) {
  const {storeId} = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { 
    addItem, 
    updateQuantity, 
    getItemQuantity,
    getStoreItemCount,
    getStoreTotalPrice,
  } = useCart();
  
  // Get data passed from home page via URL params
  const distanceParam = searchParams.get("distance");
  const deliveryFeeParam = searchParams.get("deliveryFee");
  const estimatedTimeParam = searchParams.get("estimatedTime");
  const storeItemCount = getStoreItemCount(storeId);
  const storeTotalPrice = getStoreTotalPrice(storeId);

  const [store, setStore] = useState<CustomerStore | null>(null);
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

        const domainStore = await storeService.getStore(storeId);

          if (!domainStore) {
            router.push("/home");
            return;
          }
        
        const productsData =
        await productService.getStoreProducts(storeId);

        setAllProducts(productsData);
        setDisplayProducts(productsData);

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

        let distance = parseFloat(distanceParam || "0");
        let deliveryFee = parseFloat(deliveryFeeParam || "0");
        let estimatedTime = parseInt(estimatedTimeParam || "0");

        const hasUserCoordinates =
        userLocation !== null &&
        Number.isFinite(userLocation.lat) &&
        Number.isFinite(userLocation.lng);

      const hasStoreCoordinates =
        Number.isFinite(domainStore.latitude) &&
        Number.isFinite(domainStore.longitude);

      if (
        distance <= 0 &&
        hasUserCoordinates &&
        hasStoreCoordinates
      ) {
        distance = calculateDistance(
          userLocation.lat,
          userLocation.lng,
          domainStore.latitude,
          domainStore.longitude
        );

        const pricing =
          calculateDeliveryFee(distance, 0);

        deliveryFee = pricing.deliveryFee;

        estimatedTime =
          getEstimatedTimeNumber(distance);
      }

        
      const customerStore =
  storeMapper.toCustomerStore(
    domainStore,
    {
      distance,

      deliveryFee,

      deliveryFeeDisplay:
        getDeliveryFeeDisplay(distance),

      estimatedPrepTime:
        estimatedTime ||
        DELIVERY_CONFIG.DEFAULT_PREP_MINUTES,

      estimatedDeliveryTime:
        getEstimatedTime(distance),

      reviewCount: 0,

      categories: categoriesList,

      promotions: [
        {
          id: "promo1",
          title: "Free Delivery",
          description:
            "Free delivery on qualifying orders",
          imageUrl: "",
          type: "free_shipping",
        },
      ],

      isFavorite: false,
    }
  );

        setStore(customerStore);

       const maxRadius = DELIVERY_CONFIG.MAX_RADIUS_MILES;
        if (distance > maxRadius) {
          setDistanceValue(distance);
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

  // Handle filtering based on category and search
  useEffect(() => {
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

    if (selectedCategory === "all") {
      setDisplayProducts(allProducts);
    } else {
      const category = categories.find(c => c.id === selectedCategory);
      setDisplayProducts(category?.products || []);
    }
  }, [selectedCategory, allProducts, searchQuery, categories]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleCategorySelect = (categoryId: string) => {
    setSelectedCategory(categoryId);
    if (searchQuery) {
      setSearchQuery("");
    }
  };

  // ✅ Handle add to cart with quantity update
  const handleAddToCart = (product: Product) => {
    if (!store) return;
    
    const currentQty = getItemQuantity(product.id);
    if (currentQty > 0) {
      // If already in cart, increase quantity
      updateQuantity(product.id, currentQty + 1);
    } else {
      // Add new item
      addItem({
        id: product.id,
        name: product.name,
        price: product.price,
        imageUrl: product.imageUrl,
        storeId: store.id,
        storeName: store.name,
        storeAddress: store.address,
        storePhone: store.phone,
        storeLatitude: store.latitude,
        storeLongitude: store.longitude,
        size: product.size ?? undefined,
      });
    }
  };

  // ✅ Handle quantity change from product card
  const handleQuantityChange = (productId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      // Remove from cart (handled by updateQuantity with 0)
      updateQuantity(productId, 0);
    } else {
      updateQuantity(productId, newQuantity);
    }
  };

  const handleContinueToStore = () => {
    setShowDistanceWarning(false);
  };

  const handleGoBack = () => {
    setShowDistanceWarning(false);
    router.push("/home");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex flex-col justify-center items-center relative overflow-hidden">
        <div className="absolute top-0 right-0 h-[500px] w-[500px] rounded-full bg-yellow-400/5 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 h-[400px] w-[400px] rounded-full bg-blue-500/5 blur-[100px] pointer-events-none" />

        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center justify-center p-8 relative z-10"
        >
          <div className="relative w-28 h-28 mb-8 flex items-center justify-center">
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0 rounded-full border-2 border-dashed border-yellow-400/30"
            />
            <motion.div 
              animate={{ rotate: -360 }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
              className="absolute inset-2 rounded-full border border-yellow-400/10"
            />
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

            <div className="relative w-16 h-16 z-10 bg-white/80 backdrop-blur-md rounded-full border-2 border-yellow-400/50 shadow-[0_0_30px_rgba(234,179,8,0.15)] flex items-center justify-center overflow-hidden">
              <img 
                src="/icon/icon-192.png" 
                alt="LIA Logo" 
                className="w-12 h-12 object-contain" 
              />
            </div>
          </div>

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
              <motion.span 
                initial={{ opacity: 0.5 }} 
                animate={{ opacity: [0.5, 1, 0.5] }} 
                transition={{ duration: 1.5, repeat: Infinity, delay: 0 }} 
                className="w-1.5 h-1.5 rounded-full bg-yellow-400"
              />
              <motion.span 
                initial={{ opacity: 0.5 }} 
                animate={{ opacity: [0.5, 1, 0.5] }} 
                transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }} 
                className="w-1.5 h-1.5 rounded-full bg-yellow-400"
              />
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
    <main className="min-h-screen bg-gray-50 pb-2">
      {/* Store Header */}
      <StoreHeader
        bannerUrl={store.bannerUrl}
        logoUrl={store.logoUrl}
        name={store.name}
        rating={store.rating ?? 0}
        reviewCount={store.reviewCount}
        onBack={() => router.push("/home")}
      />

      {/* Store Info - ✅ Use store.id instead of storeData.id */}
      <StoreInfo
        name={store.name}
        isOpen={store.isOpen}
        distance={store.distance}
        deliveryFee={store.deliveryFee}
        estimatedPrepTime={store.estimatedPrepTime}
        minimumOrder={store.minimumOrder}
        rating={store.rating ?? 0}
        reviewCount={store.reviewCount}
        schedule={store.schedule}
        onViewMore={() => router.push(`/store/${store.id}/info`)}
      />

      {/* Promo Banner */}
      {store.promotions && store.promotions.length > 0 && (
        <div className="px-4 mt-4">
          <PromoBanner promotions={store.promotions} />
        </div>
      )}

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
        <div className="px-4 mt-4 pb-24">
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
                  onQuantityChange={handleQuantityChange}
                  quantity={getItemQuantity(product.id)}
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
            onQuantityChange={handleQuantityChange}
            getQuantity={getItemQuantity}
            onViewAll={() => {
              setSelectedCategory(category.id);
              setSearchQuery("");
            }}
          />
        ))
      )}

      {/* Bottom Bar */}
      <BottomBar
        searchQuery={searchQuery}
        onSearchChange={handleSearch}
        itemCount={storeItemCount}
        totalPrice={storeTotalPrice}
        storeId={store.id}
        onCartClick={() => router.push("/cart")}
      />

      {/* Distance Warning Modal */}
      <AnimatePresence>
        {showDistanceWarning && store && (
            <DistanceWarningModal
              store={store}
            distance={distanceValue}
            onClose={handleGoBack}
            onContinue={handleContinueToStore}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
