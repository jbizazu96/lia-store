"use client";

/*
  Edit product page.
  Uses React.use() to unwrap params Promise in Next.js 15.
*/

import {BrandedLoader} from "@/components/ui/BrandedLoader";
import {useState, useEffect, use} from "react";
import {useRouter} from "next/navigation";
import {motion} from "framer-motion";
import {ArrowLeft, Save, Trash2} from "lucide-react";
import Link from "next/link";

// Firebase imports
import {auth, db} from "@/lib/firebase";
import {doc, getDoc, updateDoc, serverTimestamp, deleteDoc} from "firebase/firestore";

// Components
import {ProductForm} from "@/components/store/products/ProductForm";

// Types
import {Product, ProductFormData} from "../types";

interface EditProductPageProps {
  params: Promise<{
    productId: string;
  }>;
}

export default function EditProductPage({params}: EditProductPageProps) {
  // ✅ Unwrap params with React.use() for Next.js 15
  const {productId} = use(params);
  const router = useRouter();
  
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Fetch product on mount
  useEffect(() => {
    const fetchProduct = async () => {
      try {
        const user = auth.currentUser;
        if (!user) {
          router.push("/login");
          return;
        }

        const productDoc = await getDoc(doc(db, "products", productId));

        if (!productDoc.exists()) {
          router.push("/store/products");
          return;
        }

        const data = productDoc.data();
        setProduct({
          id: productDoc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
          updatedAt: data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        } as Product);
      } catch (error) {
        console.error("Error fetching product:", error);
        router.push("/store/products");
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [productId, router]);

  /*
    Handle form submission.
  */
  const handleSubmit = async (data: ProductFormData) => {
    try {
      setSubmitting(true);

      const updateData = {
        name: data.name,
        description: data.description || "",
        category: data.category,
        price: data.price,
        displayPrice: data.displayPrice || data.price,
        taxRate: data.taxRate || 0,
        imageUrl: data.imageUrl || "",
        stock: data.stock || 0,
        size: {
          value: data.sizeValue || 0,
          unit: data.sizeUnit || "each",
        },
        promotion: data.promotionType
          ? {
              type: data.promotionType,
              description: data.promotionDescription || "",
              discountAmount: data.promotionDiscount,
              code: data.promotionCode,
              expiresAt: data.promotionExpires || null,
            }
          : null,
        isActive: data.isActive !== false,
        isFeatured: data.isFeatured || false,
        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, "products", productId), updateData);
      router.push("/store/products");

    } catch (error) {
      console.error("Error updating product:", error);
      alert("Failed to update product. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  /*
    Handle delete with confirmation.
  */
  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this product? This action cannot be undone.")) {
      return;
    }

    try {
      await deleteDoc(doc(db, "products", productId));
      router.push("/store/products");
    } catch (error) {
      console.error("Error deleting product:", error);
      alert("Failed to delete product. Please try again.");
    }
  };

  if (loading) {
    return (
        <BrandedLoader message="Loading Product Details" />
    );
  }

  // ✅ Handle null product case
  if (!product) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Product not found</p>
        <Link
          href="/store/products"
          className="inline-block mt-4 text-orange-600 hover:text-orange-700"
        >
          Back to Products
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/store/products"
            className="p-2 hover:bg-gray-100 rounded-xl transition"
            aria-label="Back to products"
          >
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Edit Product</h1>
            <p className="text-gray-500 text-sm">{product.name}</p>
          </div>
        </div>
        <button
          onClick={handleDelete}
          className="px-4 py-2 border border-red-200 text-red-600 rounded-xl font-medium hover:bg-red-50 transition flex items-center gap-2 text-sm"
          aria-label="Delete product"
        >
          <Trash2 className="w-4 h-4" />
          Delete
        </button>
      </div>

      {/* Form */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <ProductForm
          initialData={product}
          onSubmit={handleSubmit}
          loading={submitting}
          submitLabel="Save Changes"
        />
      </div>
    </div>
  );
}
