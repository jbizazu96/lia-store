"use client";

import {
  use,
  useEffect,
  useState,
} from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  CircleCheckBig,
  Gift,
  Heart,
  Package,
  Percent,
  Plus,
  ShoppingBag,
  Trash2,
  Truck,
  X,
} from "lucide-react";

import { useCart } from "@/context/CartContext";
import {CustomerFulfillmentSelector} from "@/components/customer/store/CustomerFulfillmentSelector";
import { useSuccessToast } from "@/context/SuccessToastContext";
import { ProductCard } from "@/components/customer/store/ProductCard";
import { ProductPrice } from "@/components/ui/ProductPrice";
import { productGalleryService } from "@/services/product/productGalleryService";
import { productImageSelector } from "@/services/product/productImageSelector";
import { productService } from "@/services/product/productService";
import { promotionService } from "@/services/promotion/promotionService";
import { storeService } from "@/services/store/storeService";
import { isStoreCustomerVisible } from "@/services/store/storeAvailability";
import { formatProductName } from "@/utils/productDisplay";
import { CustomerPageSkeleton } from "@/components/customer/ui/CustomerPageSkeleton";
import dynamic from "next/dynamic";
import {userService} from "@/services/user/userService";
import {getStoreDeliveryRoute} from "@/services/delivery/deliveryRoutesClientService";
import {auth} from "@/lib/firebase";
import {useProductCategories} from "@/hooks/useProductCategories";

import type {
  Product,
  ProductGalleryImage,
} from "@/types/product";
import type { Store } from "@/types/store";
import {startCustomerPerformanceTrace} from "@/services/performance/customerPerformanceService";
import {
  marketplacePricingClientService,
  type ApplicableMarketplacePricing,
} from "@/services/pricing/marketplacePricingClientService";
import {isPickupLocationAllowed} from "@/services/pricing/pickupAvailability";

const DistanceWarningModal = dynamic(
  () => import("@/components/customer/home/DistanceWarningModal")
    .then((module) => module.DistanceWarningModal),
  {ssr: false},
);

interface ProductPageProps {
  params: Promise<{ productId: string }>;
}

function getGalleryImageUrl(image: ProductGalleryImage | null): string {
  if (!image) return "";

  return (
    image.imageVariants?.large?.url ??
    image.imageVariants?.medium?.url ??
    image.imageVariants?.small?.url ??
    image.imageUrl ??
    ""
  );
}

function formatSize(product: Product): string | null {
  if (!product.size || product.size.value <= 0) return null;
  return `${product.size.value} ${product.size.unit}`;
}

function stockLabel(product: Product): string {
  if (!product.isAvailable || product.stock <= 0) return "Not available";
  if (product.stock <= 5) return `${product.stock} left in stock`;
  if (product.stock <= 20) return `${product.stock} in stock`;
  return "Many in stock";
}

function formatPromotionWindow(
  startsAt: string | null | undefined,
  endsAt: string | null | undefined
): string | null {
  const formatDate = (value: string | null | undefined) => {
    if (!value) return null;

    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? null
      : new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
      }).format(date);
  };

  const start = formatDate(startsAt);
  const end = formatDate(endsAt);

  if (start && end) return `${start} – ${end}`;
  if (end) return `Ends ${end}`;
  if (start) return `Started ${start}`;

  return null;
}

export default function ProductPage({ params }: ProductPageProps) {
  const { productId } = use(params);
  const router = useRouter();
  const { addItem, getItemQuantity, updateQuantity, fulfillmentType, setFulfillmentType } = useCart();
  const { showSuccess } = useSuccessToast();

  const [product, setProduct] = useState<Product | null>(null);
  const [store, setStore] = useState<Store | null>(null);
  const [galleryImages, setGalleryImages] = useState<ProductGalleryImage[]>([]);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [selectedQuantity, setSelectedQuantity] = useState(1);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [purchaseDistance, setPurchaseDistance] = useState(0);
  const [purchaseDistanceKnown, setPurchaseDistanceKnown] = useState(false);
  const [purchaseAllowed, setPurchaseAllowed] = useState<boolean | null>(null);
  const [showPurchaseWarning, setShowPurchaseWarning] = useState(false);
  const [applicablePricing, setApplicablePricing] =
    useState<ApplicableMarketplacePricing | null>(null);
  const productCategories = useProductCategories();

  useEffect(() => {
    let active = true;

    async function loadProductPage() {
      const productTrace = startCustomerPerformanceTrace("customer_product_ready");
      try {
        setLoading(true);
        setError(null);
        setPurchaseDistanceKnown(false);

        /*
         * Keep these public reads separate so a Firestore failure identifies
         * the exact projection path: the product document or its gallery.
         * This is especially useful while validating the public-catalog rules.
         */
        const userId = auth.currentUser?.uid;
        const customerLocationRequest = userId
          ? userService.getDefaultLocation(userId)
          : Promise.resolve(null);
        const [productResult, galleryResult] = await Promise.allSettled([
          productService.getProduct(productId),
          productGalleryService.getProductImages(productId),
        ]);

        if (productResult.status === "rejected") {
          console.error(
            "Error loading customer product profile:",
            productResult.reason
          );
          throw productResult.reason;
        }

        if (galleryResult.status === "rejected") {
          console.error(
            "Error loading customer product gallery:",
            galleryResult.reason
          );
          throw galleryResult.reason;
        }

        const productData = productResult.value;
        const imageData = galleryResult.value;

        if (!productData) {
          if (active) setError("Product not found.");
          productTrace.stop({status: "not_found"});
          return;
        }

        const pricingRequest = marketplacePricingClientService.getHomeBootstrap([
          productData.storeId,
        ]);
        const routeRequest = customerLocationRequest.then((location) =>
          location
            ? getStoreDeliveryRoute(productData.storeId, {
              latitude: location.lat,
              longitude: location.lng,
            })
            : null,
        );
        const [storeData, relatedPage, pricingBootstrap, route] = await Promise.all([
          storeService.getStore(productData.storeId),
          productService.getStoreProductsPage(productData.storeId, {
            categoryValues: [productData.category],
            pageSize: 8,
          }),
          pricingRequest,
          routeRequest,
        ]);

        if (!active) {
          productTrace.stop({status: "cancelled"});
          return;
        }

        if (!storeData || !isStoreCustomerVisible(storeData)) {
          setError("This store is not currently available.");
          productTrace.stop({status: "store_unavailable"});
          return;
        }

        const pricing = pricingBootstrap.byStoreId[productData.storeId] ?? {
          policy: pricingBootstrap.policy,
          decision: null,
          pickupDecision: null,
          storePickupEnabled: false,
        };
        const distance = route?.distanceMiles ?? 0;

        setProduct(productData);
        setStore(storeData);
        setApplicablePricing(pricing);
        setPurchaseDistance(distance);
        setPurchaseDistanceKnown(Boolean(route));
        setPurchaseAllowed(
          Boolean(route) &&
          pricing.decision?.allowed !== false &&
          (pricing.decision?.zoneAccessType === "customer_order_zone" ||
            distance <= pricing.policy.maxRadiusMiles),
        );
        setGalleryImages(imageData);
        setSelectedImageIndex(0);
        setSelectedQuantity(1);
        setRelatedProducts(
          relatedPage.products
            .filter(
              (candidate) =>
                candidate.id !== productData.id &&
                candidate.category === productData.category &&
                candidate.imageStatus === "ready"
            )
            .slice(0, 7)
        );
        productTrace.stop({status: "success"});
      } catch (loadError) {
        productTrace.stop({status: "error"});
        console.error("Error loading product details:", loadError);
        if (active) setError("Failed to load this product.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadProductPage();
    return () => {
      active = false;
    };
  }, [productId]);

  const selectedImage = galleryImages[selectedImageIndex] ?? null;
  const selectedImageUrl =
    getGalleryImageUrl(selectedImage) ||
    (product ? productImageSelector.getUrl(product, "details") : "");
  const discountedPrice = product
    ? promotionService.getDiscountedPrice(product.price, product.promotion)
    : 0;
  const activePromotion =
    product?.promotion && promotionService.isActive(product.promotion)
      ? product.promotion
      : null;
  const productSize = product ? formatSize(product) : null;
  const effectiveStorePickupEnabled =
    applicablePricing?.storePickupEnabled ?? store?.pickupEnabled === true;
  const canPurchase = Boolean(
    product &&
      product.isAvailable &&
      product.stock > 0 &&
      product.imageStatus === "ready"
  );
  const hasFulfillmentAccess = purchaseAllowed === true ||
    (fulfillmentType === "pickup" &&
      effectiveStorePickupEnabled &&
      isPickupLocationAllowed(
        applicablePricing?.policy,
        applicablePricing?.pickupDecision?.allowed === true,
        purchaseDistanceKnown ? purchaseDistance : null,
      ));
  const promotionWindow = activePromotion
    ? formatPromotionWindow(
      activePromotion.startsAt,
      activePromotion.endsAt
    )
    : null;
  const PromotionIcon = activePromotion?.type === "bogo"
    ? Gift
    : activePromotion?.type === "free_shipping"
      ? Truck
      : Percent;
  const promotionColors = activePromotion?.type === "bogo"
    ? "border-violet-200 bg-violet-50 text-violet-800"
    : activePromotion?.type === "free_shipping"
      ? "border-blue-200 bg-blue-50 text-blue-800"
      : "border-rose-200 bg-rose-50 text-rose-800";

  const changeImage = (direction: -1 | 1) => {
    if (galleryImages.length < 2) return;
    setSelectedImageIndex((current) =>
      (current + direction + galleryImages.length) % galleryImages.length
    );
  };

  const addProductToCart = async (target: Product): Promise<boolean> => {
    if (!store || !target.isAvailable || target.stock <= 0) return false;
    if (!hasFulfillmentAccess) {
      setShowPurchaseWarning(true);
      return false;
    }

    const discountedPrice =
      promotionService.getDiscountedPrice(
        target.price,
        target.promotion
      );

    const result = await addItem({
      id: target.id,
      name: target.name,
      price: discountedPrice,
      originalPrice:
        discountedPrice < target.price
          ? target.price
          : undefined,
      imageUrl: productImageSelector.getUrl(target, "card"),
      storeId: store.id,
      storeName: store.name,
      storeAddress: store.address,
      storePhone: store.phone,
      storeLatitude: store.latitude,
      storeLongitude: store.longitude,
      stock: target.stock,
      size: target.size ?? undefined,
    });

    return result.added;
  };

      const addCurrentProduct =
          async () => {
            if (
              !product ||
              !canPurchase
            ) {
              return;
            }
            if (!hasFulfillmentAccess) {
              setShowPurchaseWarning(true);
              return;
            }

            const currentQuantity =
              getItemQuantity(
                product.id
              );

            /*
            * Add the product once when it is not already in the cart.
            */
            if (currentQuantity === 0) {
              const added = await addProductToCart(
                product
              );

              if (!added) {
                return;
              }
            }

            /*
            * Set the final requested quantity directly.
            *
            * This avoids repeatedly calling addItem() while React cart state is still
            * updating.
            */
            const finalQuantity =
              Math.min(
                currentQuantity +
                  selectedQuantity,
                product.stock
              );

            updateQuantity(
              product.id,
              finalQuantity
            );

            showSuccess(
              `${
                selectedQuantity > 1
                  ? `${selectedQuantity} × `
                  : ""
              }${formatProductName(
                product.name
              )} added to cart.`
            );

            router.push(`/store/${product.storeId}`);
          };

  const increaseSelectedQuantity = () => {
    if (!product || !canPurchase) return;
    setSelectedQuantity((current) => Math.min(current + 1, product.stock));
  };

  const decreaseSelectedQuantity = () => {
    setSelectedQuantity((current) => Math.max(1, current - 1));
  };

  const relatedQuantityChange = (relatedProductId: string, nextQuantity: number) => {
    if (nextQuantity > getItemQuantity(relatedProductId) && !hasFulfillmentAccess) {
      setShowPurchaseWarning(true);
      return;
    }
    updateQuantity(relatedProductId, Math.max(0, nextQuantity));
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartX === null || galleryImages.length < 2) return;
    const difference = event.changedTouches[0].clientX - touchStartX;
    setTouchStartX(null);
    if (Math.abs(difference) < 40) return;
    changeImage(difference > 0 ? -1 : 1);
  };

  if (loading) {
    return <CustomerPageSkeleton variant="product" />;
  }

  if (error || !product) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white px-6 text-center">
        <Package className="h-12 w-12 text-gray-300" />
        <p className="text-gray-600">{error ?? "Product not found."}</p>
        <button
          type="button"
          onClick={() => router.push("/home")}
          className="rounded-xl bg-orange-500 px-5 py-2.5 font-semibold text-white"
        >
          Go back
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white pb-28 font-sans text-gray-950">
      <div className="mx-auto max-w-5xl">
        <header className="absolute inset-x-0 top-0 z-20 mx-auto flex max-w-5xl items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={() => router.push(`/store/${product.storeId}`)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/95 shadow-md transition hover:scale-105"
            aria-label="Close product details"
          >
            <X className="h-6 w-6" strokeWidth={2.5} />
          </button>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/95 shadow-md transition hover:scale-105"
            aria-label="Save product"
          >
            <Heart className="h-5 w-5" strokeWidth={2.5} />
          </button>
        </header>

        <section
          className="relative flex min-h-[19rem] items-center justify-center overflow-hidden bg-gray-50 px-6 pt-12 sm:min-h-[25rem] sm:px-8"
          onTouchStart={(event) => setTouchStartX(event.touches[0].clientX)}
          onTouchEnd={handleTouchEnd}
        >
          {selectedImageUrl ? (
            <Image
              src={selectedImageUrl}
              alt={selectedImage?.altText || formatProductName(product.name)}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 960px"
              className="object-contain p-5 sm:p-7"
            />
          ) : (
            <Package className="h-20 w-20 text-gray-300" />
          )}

          {galleryImages.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => changeImage(-1)}
                className="absolute left-4 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 shadow-md transition hover:scale-105 sm:flex"
                aria-label="Show previous image"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={() => changeImage(1)}
                className="absolute right-4 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 shadow-md transition hover:scale-105 sm:flex"
                aria-label="Show next image"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
              <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5 rounded-full bg-white/80 px-2.5 py-1.5 backdrop-blur">
                {galleryImages.map((image, index) => (
                  <button
                    key={image.id}
                    type="button"
                    onClick={() => setSelectedImageIndex(index)}
                    className={`h-2 w-2 rounded-full transition ${
                      index === selectedImageIndex ? "bg-gray-900" : "bg-gray-300"
                    }`}
                    aria-label={`Show image ${index + 1}`}
                  />
                ))}
              </div>
            </>
          )}
        </section>

        {store && (
          <div className="px-4 sm:px-6">
            <CustomerFulfillmentSelector
              compact
              fulfillmentType={fulfillmentType}
              onChange={setFulfillmentType}
              storeId={store.id}
              storePickupEnabled={effectiveStorePickupEnabled}
              distanceMiles={purchaseDistanceKnown ? purchaseDistance : null}
              deliveryAvailable={purchaseAllowed === true}
            />
          </div>
        )}

        <section className="px-4 pb-5 pt-5 sm:px-6">
          {productCategories.find((category) => category.id === product.category)?.freshnessEligible === true && (
            <div className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-800">
              <CircleCheckBig className="h-5 w-5 shrink-0 text-emerald-600" />
              <span>Freshness guaranteed or your money back</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => store && router.push(`/store/${store.id}`)}
            disabled={!store}
            className="mb-2 inline-flex items-center gap-1.5 text-sm font-bold text-gray-800 transition hover:text-orange-600 disabled:cursor-default"
          >
            {product.brand || store?.name || "Local store"}
            <ChevronRight className="h-4 w-4" />
          </button>

          <h1 className="max-w-3xl text-2xl font-black leading-tight tracking-tight sm:text-3xl">
            {formatProductName(product.name)}
          </h1>

          <div className="mt-4 flex items-end gap-2">
            <ProductPrice price={discountedPrice} className="text-3xl sm:text-4xl" />
            {discountedPrice < product.price && (
              <ProductPrice
                price={product.price}
                className="mb-0.5 text-lg text-gray-400 line-through opacity-70"
              />
            )}
          </div>

          {productSize && (
            <p className="mt-1 text-base font-medium text-gray-500">{productSize}</p>
          )}

          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
              canPurchase ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
            }`}>
              {stockLabel(product)}
            </span>
            {product.category && (
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">
                {product.category}
              </span>
            )}
          </div>

          {activePromotion && (
            <div className={`mt-3 rounded-xl border p-3 ${promotionColors}`}>
              <div className="flex items-start gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/70">
                  <PromotionIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-extrabold">
                    {promotionService.getLabel(activePromotion) || activePromotion.title}
                  </p>
                  {activePromotion.description && (
                    <p className="mt-0.5 text-xs leading-5 opacity-80">
                      {activePromotion.description}
                    </p>
                  )}
                  {promotionWindow && (
                    <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold">
                      <CalendarDays className="h-3 w-3" />
                      {promotionWindow}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {product.description && (
            <p className="mt-4 max-w-2xl text-sm leading-5 text-gray-600">{product.description}</p>
          )}
        </section>

        {relatedProducts.length > 0 && (
          <section className="border-t border-gray-100 px-4 py-5 sm:px-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-black tracking-tight">You may also like</h2>
              <button
                type="button"
                onClick={() => store && router.push(`/store/${store.id}`)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 transition hover:bg-orange-500 hover:text-white"
                aria-label="View more products from this category"
              >
                <ChevronRight className="h-5 w-5" strokeWidth={2.5} />
              </button>
            </div>

            <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide">
              {relatedProducts.map((relatedProduct) => (
                <div key={relatedProduct.id} className="shrink-0">
                  <ProductCard
                    product={relatedProduct}
                    quantity={getItemQuantity(relatedProduct.id)}
                    onAddToCart={(nextProduct) => void addProductToCart(nextProduct)}
                    onQuantityChange={relatedQuantityChange}
                  />
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2.5">
          <div className="flex h-12 min-w-[8.5rem] items-center justify-between rounded-full bg-gray-100 px-1.5">
            <button
              type="button"
              onClick={decreaseSelectedQuantity}
              disabled={selectedQuantity === 1 || !canPurchase}
              className="flex h-9 w-9 items-center justify-center rounded-full text-gray-700 transition hover:bg-white disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent"
              aria-label={selectedQuantity === 1 ? "Minimum quantity" : "Decrease quantity"}
            >
              {selectedQuantity === 1 ? (
                <Trash2 className="h-5 w-5" />
              ) : (
                <span className="text-2xl font-medium leading-none">−</span>
              )}
            </button>
            <span className="text-base font-black tabular-nums">{selectedQuantity}</span>
            <button
              type="button"
              onClick={increaseSelectedQuantity}
              disabled={!canPurchase || selectedQuantity >= product.stock}
              className="flex h-9 w-9 items-center justify-center rounded-full text-gray-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-35"
              aria-label="Increase quantity"
            >
              <Plus className="h-6 w-6" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => void addCurrentProduct()}
            disabled={!canPurchase}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-orange-500 to-red-500 px-4 text-base font-black text-white shadow-lg shadow-orange-200 transition hover:from-orange-600 hover:to-red-600 disabled:cursor-not-allowed disabled:from-gray-300 disabled:to-gray-300 disabled:shadow-none"
          >
            <ShoppingBag className="h-5 w-5" />
            {canPurchase
              ? "Add to cart"
              : product.stock <= 0
              ? "Out of stock"
              : "Unavailable"}
          </button>
        </div>
      </div>
      {showPurchaseWarning && store && (
        <DistanceWarningModal
          storeId={store.id}
          storeCity={store.city}
          distance={purchaseDistance}
          zoneAccessAllowed={applicablePricing?.decision?.allowed ?? false}
          pickupAvailable={effectiveStorePickupEnabled && isPickupLocationAllowed(applicablePricing?.policy, applicablePricing?.pickupDecision?.allowed === true, purchaseDistanceKnown ? purchaseDistance : null)}
          storePickupEnabled={effectiveStorePickupEnabled}
          onClose={() => setShowPurchaseWarning(false)}
          onContinue={() => {
            if (effectiveStorePickupEnabled && isPickupLocationAllowed(applicablePricing?.policy, applicablePricing?.pickupDecision?.allowed === true, purchaseDistanceKnown ? purchaseDistance : null)) {
              setFulfillmentType("pickup");
            }
            setShowPurchaseWarning(false);
          }}
        />
      )}
    </main>
  );
}
