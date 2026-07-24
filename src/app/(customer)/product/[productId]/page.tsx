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
  Heart,
  Package,
  Plus,
  ShoppingBag,
  Trash2,
  X,
} from "lucide-react";

import { useCart } from "@/context/CartContext";
import { useConfirmation } from "@/context/ConfirmationContext";
import { useSuccessToast } from "@/context/SuccessToastContext";
import { ProductCard } from "@/components/customer/store/ProductCard";
import { ProductPrice } from "@/components/ui/ProductPrice";
import { productGalleryService } from "@/services/product/productGalleryService";
import { productImageSelector } from "@/services/product/productImageSelector";
import { productService } from "@/services/product/productService";
import { promotionService } from "@/services/promotion/promotionService";
import { storeService } from "@/services/store/storeService";
import { formatProductName } from "@/utils/productDisplay";

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

export default function ProductPage({ params }: ProductPageProps) {
  const { productId } = use(params);
  const router = useRouter();
  const { addItem, getItemQuantity, updateQuantity } = useCart();
  const { confirm } = useConfirmation();
  const { showSuccess } = useSuccessToast();

  const [product, setProduct] = useState<Product | null>(null);
  const [store, setStore] = useState<Store | null>(null);
  const [galleryImages, setGalleryImages] = useState<ProductGalleryImage[]>([]);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadProductPage() {
      try {
        setLoading(true);
        setError(null);

        const [productData, imageData] = await Promise.all([
          productService.getProduct(productId),
          productGalleryService.getProductImages(productId),
        ]);

        if (!productData) {
          if (active) setError("Product not found.");
          return;
        }

        const [storeData, storeProducts] = await Promise.all([
          storeService.getStore(productData.storeId),
          productService.getStoreProducts(productData.storeId),
        ]);

        if (!active) return;

        setProduct(productData);
        setStore(storeData);
        setGalleryImages(imageData);
        setSelectedImageIndex(0);
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
  const quantity = product ? getItemQuantity(product.id) : 0;
  const discountedPrice = product
    ? promotionService.getDiscountedPrice(product.price, product.promotion)
    : 0;
  const productSize = product ? formatSize(product) : null;
  const canPurchase = Boolean(
    product &&
      product.isAvailable &&
      product.stock > 0 &&
      product.imageStatus === "ready"
  );

  const changeImage = (direction: -1 | 1) => {
    if (galleryImages.length < 2) return;
    setSelectedImageIndex((current) =>
      (current + direction + galleryImages.length) % galleryImages.length
    );
  };

  const addProductToCart = async (target: Product) => {
    if (!store || !target.isAvailable || target.stock <= 0) return;

    await addItem({
      id: target.id,
      name: target.name,
      price: promotionService.getDiscountedPrice(target.price, target.promotion),
      imageUrl: productImageSelector.getUrl(target, "card"),
      storeId: store.id,
      storeName: store.name,
      storeAddress: store.address,
      storePhone: store.phone,
      storeLatitude: store.latitude,
      storeLongitude: store.longitude,
      size: target.size ?? undefined,
    });
  };

  const addCurrentProduct = async () => {
    if (!product || !canPurchase) return;
    await addProductToCart(product);
    showSuccess(`${formatProductName(product.name)} added to cart.`);
  };

  const increaseQuantity = async () => {
    if (!product || !canPurchase || quantity >= product.stock) return;
    if (quantity === 0) {
      await addCurrentProduct();
      return;
    }
    updateQuantity(product.id, quantity + 1);
  };

  const decreaseQuantity = async () => {
    if (!product || quantity <= 0) return;

    if (quantity === 1) {
      const confirmed = await confirm({
        title: "Remove from cart?",
        message: `${formatProductName(product.name)} will be removed from your cart.`,
        confirmLabel: "Remove",
        cancelLabel: "Keep item",
        destructive: true,
      });

      if (!confirmed) return;
      updateQuantity(product.id, 0);
      showSuccess("Item removed from cart.");
      return;
    }

    updateQuantity(product.id, quantity - 1);
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
    return (
      <main className="flex min-h-screen items-center justify-center bg-white">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-orange-100 border-t-orange-500" />
      </main>
    );
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
          {quantity > 0 && (
            <div className="flex h-12 min-w-[8.5rem] items-center justify-between rounded-full bg-gray-100 px-1.5">
              <button
                type="button"
                onClick={() => void decreaseQuantity()}
                className="flex h-9 w-9 items-center justify-center rounded-full text-gray-700 transition hover:bg-white"
                aria-label={quantity === 1 ? "Remove from cart" : "Decrease quantity"}
              >
                {quantity === 1 ? <Trash2 className="h-5 w-5" /> : <span className="text-2xl font-medium">−</span>}
              </button>
              <span className="text-base font-black tabular-nums">{quantity}</span>
              <button
                type="button"
                onClick={() => void increaseQuantity()}
                disabled={!canPurchase || quantity >= product.stock}
                className="flex h-9 w-9 items-center justify-center rounded-full text-gray-900 transition hover:bg-white disabled:opacity-35"
                aria-label="Increase quantity"
              >
                <Plus className="h-6 w-6" />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => void increaseQuantity()}
            disabled={!canPurchase || quantity >= product.stock}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-orange-500 to-red-500 px-4 text-base font-black text-white shadow-lg shadow-orange-200 transition hover:from-orange-600 hover:to-red-600 disabled:cursor-not-allowed disabled:from-gray-300 disabled:to-gray-300 disabled:shadow-none"
          >
            <ShoppingBag className="h-5 w-5" />
            {quantity > 0
              ? quantity >= product.stock
                ? "Maximum in cart"
                : "Add another"
              : canPurchase
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
