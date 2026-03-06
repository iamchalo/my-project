export type UserRole = 'cashier' | 'manager' | 'admin' | 'superadmin';

// Database types
export interface Branch {
  id: string;
  name: string;
  code: string;
  address?: string;
  phone?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Product {
  id: string;
  product_name: string;
  category: string;
  product_price: number;
  image_url?: string;
  is_active: boolean;
  branch_id: string;
  created_by?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  branch_id?: string;
  avatar_url?: string;
  phone?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  branch?: Branch; // Optional joined branch data
}

// Legacy User interface (for compatibility with existing mock data)
export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  phone?: string;
  createdAt: Date;
}

export interface Transaction {
  id: string;
  amount: number;
  date: Date;
  cashierId: string;
  cashierName: string;
  items: number;
  status: 'completed' | 'pending' | 'cancelled';
}

export interface StatCard {
  title: string;
  value: string | number;
  change?: number;
  changeType?: 'increase' | 'decrease';
  icon?: string;
}

export interface SalesData {
  date: string;
  sales: number;
  transactions: number;
}

export interface NavigationCard {
  title: string;
  description: string;
  href: string;
  icon: string;
}
