"use client";

import {
  use,
  useEffect,
  useMemo,
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
import { PageContentSkeleton } from "@/components/ui/PageContentSkeleton";

import type {
  Product,
  ProductGalleryImage,
} from "@/types/product";
import type { Store } from "@/types/store";

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

function qualifiesForFreshnessGuarantee(
  category: string | undefined
): boolean {
  if (!category) return false;

  return [
    "produce",
    "meat",
    "seafood",
    "dairy",
    "bakery",
    "frozen",
  ].includes(category.trim().toLowerCase());
}

export default function ProductPage({ params }: ProductPageProps) {
  const { productId } = use(params);
  const router = useRouter();
  const { addItem, getItemQuantity, updateQuantity } = useCart();
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

  useEffect(() => {
    let active = true;

    async function loadProductPage() {
      try {
        setLoading(true);
        setError(null);

        /*
         * Keep these public reads separate so a Firestore failure identifies
         * the exact projection path: the product document or its gallery.
         * This is especially useful while validating the public-catalog rules.
         */
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
          return;
        }

        const [storeData, storeProducts] = await Promise.all([
          storeService.getStore(productData.storeId),
          productService.getStoreProducts(productData.storeId),
        ]);

        if (!active) return;

        if (!storeData || !isStoreCustomerVisible(storeData)) {
          setError("This store is not currently available.");
          return;
        }

        setProduct(productData);
        setStore(storeData);
        setGalleryImages(imageData);
        setSelectedImageIndex(0);
        setSelectedQuantity(1);
        setRelatedProducts(
          storeProducts
            .filter(
              (candidate) =>
                candidate.id !== productData.id &&
                candidate.category === productData.category &&
                candidate.imageStatus === "ready"
            )
            .slice(0, 7)
        );
      } catch (loadError) {
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
  const canPurchase = Boolean(
    product &&
      product.isAvailable &&
      product.stock > 0 &&
      product.imageStatus === "ready"
  );
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

  const addProductToCart = async (target: Product) => {
    if (!store || !target.isAvailable || target.stock <= 0) return;

    const discountedPrice =
      promotionService.getDiscountedPrice(
        target.price,
        target.promotion
      );

    await addItem({
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
  };

      const addCurrentProduct =
          async () => {
            if (
              !product ||
              !canPurchase
            ) {
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
              await addProductToCart(
                product
              );
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

            router.back();
          };

  const increaseSelectedQuantity = () => {
    if (!product || !canPurchase) return;
    setSelectedQuantity((current) => Math.min(current + 1, product.stock));
  };

  const decreaseSelectedQuantity = () => {
    setSelectedQuantity((current) => Math.max(1, current - 1));
  };

  const relatedQuantityChange = (relatedProductId: string, nextQuantity: number) => {
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
    return <main className="min-h-screen bg-white p-4"><PageContentSkeleton cards={2} rows={2} /></main>;
  }

  if (error || !product) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white px-6 text-center">
        <Package className="h-12 w-12 text-gray-300" />
        <p className="text-gray-600">{error ?? "Product not found."}</p>
        <button
          type="button"
          onClick={() => router.back()}
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
        <header className="absolute inset-x-0 top-0 z-20 mx-auto flex max-w-5xl items-center justify-between px-4 pt-4">
          <button
            type="button"
            onClick={() => router.back()}
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

        <section className="px-4 pb-5 pt-5 sm:px-6">
          {qualifiesForFreshnessGuarantee(product.category) && (
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

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 p-3 backdrop-blur">
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
    </main>
  );
}
