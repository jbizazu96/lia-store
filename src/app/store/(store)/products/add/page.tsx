"use client";

/*
  Add product page.
*/

import {useState, useEffect} from "react";
import {useRouter} from "next/navigation";
import {motion} from "framer-motion";
import {ArrowLeft, Save, X} from "lucide-react";
import Link from "next/link";

// Firebase imports
import {auth, db} from "@/lib/firebase";
import {doc, getDoc, addDoc, collection, serverTimestamp} from "firebase/firestore";

// Components
import {ProductForm} from "../components/ProductForm";

// Types
import {ProductFormData} from "../types";

export default function AddProductPage() {
  const router = useRouter();
  const [storeId, setStoreId] = useState("");
  const [loading, setLoading] = useState(false);

  // Get store ID on mount
  useEffect(() => {
    const getStoreId = async () => {
      const user = auth.currentUser;
      if (!user) {
        router.push("/login");
        return;
      }

      const userDoc = await getDoc(doc(db, "users", user.uid));
      const storeId = userDoc.data()?.storeId;

      if (!storeId) {
        router.push("/store/create");
        return;
      }

      setStoreId(storeId);
    };

    getStoreId();
  }, [router]);

  /*
    Handle form submission.
  */
  const handleSubmit = async (data: ProductFormData) => {
    if (!storeId) return;

    try {
      setLoading(true);

      // Prepare product data
      const productData = {
        storeId,
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
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await addDoc(collection(db, "products"), productData);

      // Redirect to products list
      router.push("/store/products");

    } catch (error) {
      console.error("Error adding product:", error);
      alert("Failed to add product. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/store/products"
          className="p-2 hover:bg-gray-100 rounded-xl transition"
          aria-label="Back to products"
        >
          <ArrowLeft className="w-5 h-5 text-gray-500" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Add Product</h1>
          <p className="text-gray-500 text-sm">Add a new product to your store</p>
        </div>
      </div>

      {/* Form */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <ProductForm
          onSubmit={handleSubmit}
          loading={loading}
          submitLabel="Add Product"
        />
      </div>
    </div>
  );
}