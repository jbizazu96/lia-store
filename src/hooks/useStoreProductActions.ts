"use client";

import {useCallback} from "react";
import {useConfirmation} from "@/context/ConfirmationContext";
import {productService} from "@/services/product/productService";
import type {Product} from "@/types/product";

export function useStoreProductActions(refreshProducts: () => Promise<void>) {
  const {confirm} = useConfirmation();

  const toggleProductActive = useCallback(async (productId: string, currentStatus: boolean) => {
    try {
      await productService.updateAvailability(productId, !currentStatus);
      await refreshProducts();
    } catch (error) {
      console.error("Error updating product availability:", error);
      window.alert("Failed to update product availability");
    }
  }, [refreshProducts]);

  const toggleProductFeatured = useCallback(async (productId: string, currentStatus: boolean) => {
    try {
      await productService.updateFeatured(productId, !currentStatus);
      await refreshProducts();
    } catch (error) {
      console.error("Error updating featured status:", error);
      window.alert("Failed to update featured status");
    }
  }, [refreshProducts]);

  const deleteProduct = useCallback(async (productId: string) => {
    const confirmed = await confirm({
      title: "Delete product?",
      message: "This product and its images will be permanently removed. This action cannot be undone.",
      confirmLabel: "Delete product",
      cancelLabel: "Keep product",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await productService.deleteProduct(productId);
      await refreshProducts();
    } catch (error) {
      console.error("Error deleting product:", error);
      window.alert("Failed to delete product");
    }
  }, [confirm, refreshProducts]);

  const duplicateProduct = useCallback(async (product: Product) => {
    try {
      await productService.duplicateProduct(product);
      await refreshProducts();
    } catch (error) {
      console.error("Error duplicating product:", error);
      window.alert("Failed to duplicate product");
    }
  }, [refreshProducts]);

  return {toggleProductActive, toggleProductFeatured, deleteProduct, duplicateProduct};
}
