/*
|--------------------------------------------------------------------------
| Product Form Submission
|--------------------------------------------------------------------------
|
| Separates serializable product data from the browser-only File object.
|
| ProductFormData can safely move through services and Firestore.
| File exists only in the browser during an upload.
|
*/

import type {
  ProductFormData,
} from "@/types/productForm";

export interface ProductFormSubmission {
  /*
   * Product fields entered by the store owner.
   */
  data: ProductFormData;

  /*
   * Newly selected original image.
   *
   * Null means:
   * - no new image was selected, or
   * - the existing product image should remain unchanged.
   */
  imageFile: File | null;
}