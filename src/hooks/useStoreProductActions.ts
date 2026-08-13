"use client";

import {useCallback, useState} from "react";
import {useConfirmation} from "@/context/ConfirmationContext";
import {productService} from "@/services/product/productService";
import type {Product} from "@/types/product";

export function useStoreProductActions(refreshProducts: () => Promise<void>) {
  const {confirm} = useConfirmation();
  const [pendingProductIds, setPendingProductIds] = useState<Set<string>>(new Set());
  const run = useCallback(async (productId: string, operation: () => Promise<void>) => {
    if (pendingProductIds.has(productId)) return;
    setPendingProductIds((current) => new Set(current).add(productId));
    try { await operation(); } finally { setPendingProductIds((current) => {const next = new Set(current); next.delete(productId); return next;}); }
  }, [pendingProductIds]);

  const toggleProductActive = useCallback(async (productId: string, currentStatus: boolean) => {
    try {
      await run(productId, async () => {await productService.updateAvailability(productId, !currentStatus); await refreshProducts();});
    } catch (error) {
      console.error("Error updating product availability:", error);
      window.alert("Failed to update product availability");
    }
  }, [refreshProducts, run]);

  const toggleProductFeatured = useCallback(async (productId: string, currentStatus: boolean) => {
    try {
      await run(productId, async () => {await productService.updateFeatured(productId, !currentStatus); await refreshProducts();});
    } catch (error) {
      console.error("Error updating featured status:", error);
      window.alert("Failed to update featured status");
    }
  }, [refreshProducts, run]);

  const deleteProduct = useCallback(async (productId: string) => {
    const confirmed = await confirm({
      title: "Archive product?",
      message: "This product will be removed from the active catalog while its order and inventory history are preserved.",
      confirmLabel: "Archive product",
      cancelLabel: "Keep product",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await run(productId, async () => {await productService.deleteProduct(productId); await refreshProducts();});
    } catch (error) {
      console.error("Error deleting product:", error);
      window.alert("Failed to delete product");
    }
  }, [confirm, refreshProducts, run]);

  const duplicateProduct = useCallback(async (product: Product) => {
    try {
      await run(product.id, async () => {await productService.duplicateProduct(product); await refreshProducts();});
    } catch (error) {
      console.error("Error duplicating product:", error);
      window.alert("Failed to duplicate product");
    }
  }, [refreshProducts, run]);

  return {toggleProductActive, toggleProductFeatured, deleteProduct, duplicateProduct, isMutating: (productId: string) => pendingProductIds.has(productId)};
}
