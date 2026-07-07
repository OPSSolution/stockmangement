export type ProductType = 'kg' | 'pack' | 'box' | 'piece' | 'liter' | 'meter' | 'bottle' | 'bundle';

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  warehouse: string;
  vendor?: string;
  imageUrl?: string;
  stock: number;
  lowStockThreshold: number;
  price: number;
  productType: ProductType;
  status: 'in_stock' | 'low_stock' | 'out_of_stock';
  lastUpdated: string;
}

export interface StockAlert {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  warehouse: string;
  currentStock: number;
  threshold: number;
  severity: 'critical' | 'warning';
  timestamp: string;
}

export interface RecentActivity {
  id: string;
  type: 'sale' | 'purchase' | 'transfer' | 'return' | 'adjustment';
  description: string;
  product: string;
  quantity: number;
  warehouse: string;
  timestamp: string;
  user: string;
}

export interface DeliveryStatus {
  id: string;
  orderId: string;
  customer: string;
  items: number;
  status: 'prepare' | 'ready' | 'in_transit' | 'delivered';
  lastUpdate: string;
  destination: string;
}

export const products: Product[] = [
  { id: 'P001', name: 'Wireless Bluetooth Headphones', sku: 'WBH-001', category: 'Electronics', warehouse: 'BM Warehouse', stock: 124, lowStockThreshold: 20, price: 89.99, status: 'in_stock', lastUpdated: '2026-05-19 09:15', productType: 'piece' },
  { id: 'P002', name: 'Ergonomic Office Chair', sku: 'EOC-002', category: 'Furniture', warehouse: 'BM Warehouse', stock: 8, lowStockThreshold: 15, price: 349.00, status: 'low_stock', lastUpdated: '2026-05-19 08:30', productType: 'piece' },
  { id: 'P003', name: 'USB-C Charging Cable 2m', sku: 'UCC-003', category: 'Accessories', warehouse: 'Vendor Warehouse', vendor: 'TechSupply Co.', stock: 0, lowStockThreshold: 50, price: 12.99, status: 'out_of_stock', lastUpdated: '2026-05-18 22:00', productType: 'pack' },
  { id: 'P004', name: 'Mechanical Keyboard RGB', sku: 'MKR-004', category: 'Electronics', warehouse: 'BM Warehouse', stock: 45, lowStockThreshold: 10, price: 129.99, status: 'in_stock', lastUpdated: '2026-05-19 10:00', productType: 'piece' },
  { id: 'P005', name: 'Standing Desk Converter', sku: 'SDC-005', category: 'Furniture', warehouse: 'Vendor Warehouse', vendor: 'ErgoWorks Ltd.', stock: 3, lowStockThreshold: 10, price: 199.50, status: 'low_stock', lastUpdated: '2026-05-19 07:45', productType: 'box' },
  { id: 'P012', name: 'Smart Home Hub Device', sku: 'SHH-012', category: 'Smart Home', warehouse: 'Vendor Warehouse', vendor: 'SmartLife Corp.', stock: 34, lowStockThreshold: 8, price: 99.00, status: 'in_stock', lastUpdated: '2026-05-19 11:00', productType: 'pack' },
];

export const stockAlerts: StockAlert[] = [
  { id: 'A001', productId: 'P003', productName: 'USB-C Charging Cable 2m', sku: 'UCC-003', warehouse: 'Vendor Warehouse', currentStock: 0, threshold: 50, severity: 'critical', timestamp: '2026-05-18 22:00' },
  { id: 'A002', productId: 'P009', productName: 'Desk Lamp LED Dimmable', sku: 'DLD-009', warehouse: 'BM Warehouse', currentStock: 0, threshold: 25, severity: 'critical', timestamp: '2026-05-18 18:00' },
  { id: 'A003', productId: 'P005', productName: 'Standing Desk Converter', sku: 'SDC-005', warehouse: 'Vendor Warehouse', currentStock: 3, threshold: 10, severity: 'warning', timestamp: '2026-05-19 07:45' },
];

export const recentActivities: RecentActivity[] = [
  { id: 'R001', type: 'sale', description: 'Order #ORD-2841 dispatched', product: 'Wireless Bluetooth Headphones', quantity: 5, warehouse: 'BM Warehouse', timestamp: '2026-05-19 11:30', user: 'Admin' },
  { id: 'R002', type: 'purchase', description: 'Purchase Order #PO-0192 received', product: 'LED Monitor 27 inch', quantity: 20, warehouse: 'BM Warehouse', timestamp: '2026-05-19 10:15', user: 'Admin' },
  { id: 'R003', type: 'transfer', description: 'Transfer #TRF-0044 completed', product: 'Noise Cancelling Earbuds', quantity: 30, warehouse: 'Vendor → BM', timestamp: '2026-05-19 09:45', user: 'SoundWave Co.' },
  { id: 'R004', type: 'return', description: 'Customer return processed', product: 'Ergonomic Office Chair', quantity: 1, warehouse: 'BM Warehouse', timestamp: '2026-05-19 09:10', user: 'Admin' },
  { id: 'R005', type: 'adjustment', description: 'Stock adjustment: sold outside platform', product: 'Standing Desk Converter', quantity: -7, warehouse: 'Vendor Warehouse', timestamp: '2026-05-19 08:50', user: 'ErgoWorks Ltd.' },
  { id: 'R006', type: 'sale', description: 'Order #ORD-2840 fulfilled', product: 'Mechanical Keyboard RGB', quantity: 3, warehouse: 'BM Warehouse', timestamp: '2026-05-19 08:20', user: 'Admin' },
  { id: 'R007', type: 'purchase', description: 'Purchase Order #PO-0191 confirmed', product: 'USB-C Charging Cable 2m', quantity: 100, warehouse: 'BM Warehouse', timestamp: '2026-05-19 07:30', user: 'Admin' },
];

export const deliveries: DeliveryStatus[] = [
  { id: 'D001', orderId: 'ORD-2841', customer: 'Zara Mitchell', items: 3, status: 'in_transit', lastUpdate: '2026-05-19 11:00', destination: 'Kuala Lumpur, MY' },
  { id: 'D002', orderId: 'ORD-2839', customer: 'Ahmed Al-Rashid', items: 1, status: 'ready', lastUpdate: '2026-05-19 09:30', destination: 'Shah Alam, MY' },
  { id: 'D003', orderId: 'ORD-2838', customer: 'Priya Nair', items: 5, status: 'delivered', lastUpdate: '2026-05-19 08:45', destination: 'Petaling Jaya, MY' },
  { id: 'D004', orderId: 'ORD-2843', customer: 'Jason Tan', items: 2, status: 'prepare', lastUpdate: '2026-05-19 11:20', destination: 'Subang Jaya, MY' },
  { id: 'D005', orderId: 'ORD-2842', customer: 'Nurul Huda', items: 4, status: 'in_transit', lastUpdate: '2026-05-19 10:40', destination: 'Cheras, MY' },
];