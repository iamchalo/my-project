import { User, Transaction, SalesData } from './types';

// Mock users
export const mockUsers: User[] = [
  {
    id: '1',
    name: 'John Cashier',
    email: 'john@example.com',
    role: 'cashier',
    phone: '+254712345678',
    createdAt: new Date('2024-01-15'),
  },
  {
    id: '2',
    name: 'Sarah Manager',
    email: 'sarah@example.com',
    role: 'manager',
    phone: '+254723456789',
    createdAt: new Date('2024-01-10'),
  },
  {
    id: '3',
    name: 'Mike Admin',
    email: 'mike@example.com',
    role: 'admin',
    phone: '+254734567890',
    createdAt: new Date('2024-01-05'),
  },
  {
    id: '4',
    name: 'Lisa Superadmin',
    email: 'lisa@example.com',
    role: 'superadmin',
    phone: '+254745678901',
    createdAt: new Date('2024-01-01'),
  },
  {
    id: '5',
    name: 'Tom Cashier',
    email: 'tom@example.com',
    role: 'cashier',
    phone: '+254756789012',
    createdAt: new Date('2024-02-01'),
  },
];

// Mock transactions
export const mockTransactions: Transaction[] = [
  {
    id: 'TXN001',
    amount: 1250.50,
    date: new Date('2024-03-10T10:30:00'),
    cashierId: '1',
    cashierName: 'John Cashier',
    items: 5,
    status: 'completed',
  },
  {
    id: 'TXN002',
    amount: 890.00,
    date: new Date('2024-03-10T11:15:00'),
    cashierId: '1',
    cashierName: 'John Cashier',
    items: 3,
    status: 'completed',
  },
  {
    id: 'TXN003',
    amount: 2100.75,
    date: new Date('2024-03-10T14:20:00'),
    cashierId: '5',
    cashierName: 'Tom Cashier',
    items: 8,
    status: 'completed',
  },
  {
    id: 'TXN004',
    amount: 450.00,
    date: new Date('2024-03-10T15:45:00'),
    cashierId: '1',
    cashierName: 'John Cashier',
    items: 2,
    status: 'pending',
  },
  {
    id: 'TXN005',
    amount: 3200.00,
    date: new Date('2024-03-10T16:30:00'),
    cashierId: '5',
    cashierName: 'Tom Cashier',
    items: 12,
    status: 'completed',
  },
];

// Mock sales data for charts
export const mockSalesData: SalesData[] = [
  { date: '2024-03-04', sales: 12500, transactions: 45 },
  { date: '2024-03-05', sales: 15800, transactions: 52 },
  { date: '2024-03-06', sales: 13200, transactions: 48 },
  { date: '2024-03-07', sales: 18900, transactions: 65 },
  { date: '2024-03-08', sales: 16500, transactions: 58 },
  { date: '2024-03-09', sales: 19200, transactions: 70 },
  { date: '2024-03-10', sales: 21500, transactions: 78 },
];

// Helper function to get current user based on role
export const getCurrentUser = (role: 'cashier' | 'manager' | 'admin' | 'superadmin'): User => {
  return mockUsers.find(user => user.role === role) || mockUsers[0];
};

// Helper function to calculate today's stats
export const getTodayStats = () => {
  const today = new Date().toDateString();
  const todayTransactions = mockTransactions.filter(
    t => t.date.toDateString() === today
  );

  const totalSales = todayTransactions.reduce((sum, t) => sum + t.amount, 0);
  const totalTransactions = todayTransactions.length;
  const averageTransaction = totalTransactions > 0 ? totalSales / totalTransactions : 0;

  return {
    totalSales,
    totalTransactions,
    averageTransaction,
    completedTransactions: todayTransactions.filter(t => t.status === 'completed').length,
  };
};
