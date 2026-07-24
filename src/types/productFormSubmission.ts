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
   * Stable gallery image ID used for uploads.
   *
   * Existing images reuse their Firestore document ID.
   * New images receive a newly generated ID.
   */
  id: string;

  /**
   * Existing Firestore gallery image document ID.
   *
   * Null means this is a brand-new image.
   */
  existingImageId: string | null;

  /**
   * Browser-only source file.
   *
   * Null means the existing image should remain unchanged,
   * unless markedForRemoval is true.
   */
  file: File | null;

  /**
   * Description used for accessibility and gallery context.
   */
  altText: string;

  /**
   * Customer gallery position.
   *
   * Front = 0
   * Back = 1
   */
  position: 0 | 1;

  /**
   * Whether this image is the primary front image.
   */
  isPrimary: boolean;

  /**
   * True when an existing image should be deleted.
   */
  markedForRemoval: boolean;
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