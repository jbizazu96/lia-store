/*
|--------------------------------------------------------------------------
| Product Form Submission
|--------------------------------------------------------------------------
|
| Separates serializable product data from browser-only File objects.
|
| ProductFormData can safely move through services and Firestore.
| File objects exist only in the browser during upload.
|
*/

import type {
  ProductFormData,
} from "@/types/productForm";

/*
|--------------------------------------------------------------------------
| Product Gallery Image Submission
|--------------------------------------------------------------------------
|
| Represents one newly selected image before it is uploaded.
|
*/

export interface ProductGalleryImageSubmission {
  /**
   * Temporary client-side ID used to track this image before upload.
   */
  id: string;

  /**
   * Browser-only source file.
   */
 file: File | null; 

  /**
   * Description used for accessibility and gallery context.
   *
   * Examples:
   *
   * - Front package
   * - Back label
   * - Nutrition facts
   * - Ingredients
   */
  altText: string;

  /**
   * Customer gallery position.
   */
  position: number;

  /**
   * Whether this image should become the primary product image.
   */
  isPrimary: boolean;
}

/*
|--------------------------------------------------------------------------
| Product Form Submission
|--------------------------------------------------------------------------
*/

export interface ProductFormSubmission {
  /**
   * Product fields entered by the store owner.
   */
  data: ProductFormData;

  /**
   * New gallery images selected by the store owner.
   *
   * An empty array means no new gallery images were selected.
   */
  imageFiles: ProductGalleryImageSubmission[];

  /**
   * Legacy single-image field.
   *
   * Keep this temporarily while ProductForm and the add/edit pages migrate
   * to imageFiles.
   *
   * New code should use imageFiles.
   */
  imageFile: File | null;
}