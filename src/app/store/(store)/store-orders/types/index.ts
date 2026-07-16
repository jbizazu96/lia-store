/*
  Order detail types.
*/

export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
  total: number;
}

export interface Order {
  id: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerNotes?: string;
  total: number;
  subtotal: number;
  tax: number;
  status: string;
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
  storeId?: string;
}

export interface StatusConfig {
  label: string;
  color: string;
  icon: any;
}