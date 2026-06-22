export interface Product {
  id: string;

  storeId: string;

  name: string;

  description: string;

  category: string;

  price: number;

  stock: number;

  imageUrl: string;

  sku: string;

  isAvailable: boolean;

  featured: boolean;

  createdAt: string;

  updatedAt: string;
}