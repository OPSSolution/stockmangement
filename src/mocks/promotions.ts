export type PromotionType = 'percentage' | 'fixed_amount' | 'buy_x_get_y' | 'bundle';
export type PromotionStatus = 'draft' | 'scheduled' | 'active' | 'paused' | 'expired';

export interface PromotionProduct {
  productId: string;
  productName: string;
  sku: string;
  imageUrl?: string | null;
  originalPrice: number;
  currentStock: number;
  expectedSalesPerDay: number;
}

export interface BundleItem {
  productId: string;
  productName: string;
  sku: string;
  imageUrl?: string | null;
  quantity: number;
  originalPrice: number;
}

export interface Promotion {
  id: string;
  name: string;
  type: PromotionType;
  status: PromotionStatus;
  description: string;
  discountValue: number;
  minOrderAmount?: number;
  maxUsageCount?: number;
  usageCount: number;
  products: PromotionProduct[];
  bundleItems?: BundleItem[];
  bundlePrice?: number;
  buyQty?: number;
  getQty?: number;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
  totalRevenue: number;
  totalUnitsSold: number;
}

export const promotions: Promotion[] = [
  {
    id: 'PROMO-001',
    name: 'Tech Sale — 20% Off Electronics',
    type: 'percentage',
    status: 'active',
    description: 'Enjoy 20% off all electronics products. Limited time offer!',
    discountValue: 20,
    minOrderAmount: 50,
    maxUsageCount: 500,
    usageCount: 238,
    startDate: '2026-05-15',
    endDate: '2026-05-25',
    createdAt: '2026-05-14 09:00',
    updatedAt: '2026-05-19 08:00',
    totalRevenue: 18420.00,
    totalUnitsSold: 312,
    products: [
      { productId: 'P001', productName: 'Wireless Bluetooth Headphones', sku: 'WBH-001', originalPrice: 89.99, currentStock: 124, expectedSalesPerDay: 8 },
      { productId: 'P004', productName: 'Mechanical Keyboard RGB', sku: 'MKR-004', originalPrice: 129.99, currentStock: 45, expectedSalesPerDay: 5 },
      { productId: 'P006', productName: 'LED Monitor 27 inch', sku: 'LMN-006', originalPrice: 279.00, currentStock: 67, expectedSalesPerDay: 4 },
      { productId: 'P008', productName: 'Webcam 4K Ultra HD', sku: 'WCM-008', originalPrice: 159.99, currentStock: 22, expectedSalesPerDay: 3 },
      { productId: 'P010', productName: 'Noise Cancelling Earbuds', sku: 'NCE-010', originalPrice: 74.99, currentStock: 88, expectedSalesPerDay: 10 },
    ],
  },
  {
    id: 'PROMO-002',
    name: 'Home Office Bundle',
    type: 'bundle',
    status: 'active',
    description: 'Get the complete home office setup at a bundled price. Save RM 120 vs buying separately.',
    discountValue: 120,
    usageCount: 44,
    bundlePrice: 499.00,
    startDate: '2026-05-10',
    endDate: '2026-05-31',
    createdAt: '2026-05-09 10:00',
    updatedAt: '2026-05-19 07:00',
    totalRevenue: 21956.00,
    totalUnitsSold: 44,
    products: [],
    bundleItems: [
      { productId: 'P006', productName: 'LED Monitor 27 inch', sku: 'LMN-006', quantity: 1, originalPrice: 279.00 },
      { productId: 'P004', productName: 'Mechanical Keyboard RGB', sku: 'MKR-004', quantity: 1, originalPrice: 129.99 },
      { productId: 'P008', productName: 'Webcam 4K Ultra HD', sku: 'WCM-008', quantity: 1, originalPrice: 159.99 },
      { productId: 'P007', productName: 'Laptop Cooling Pad', sku: 'LCP-007', quantity: 1, originalPrice: 34.99 },
    ],
  },
  {
    id: 'PROMO-003',
    name: 'Buy 2 Get 1 Free — Earbuds',
    type: 'buy_x_get_y',
    status: 'active',
    description: 'Buy any 2 Noise Cancelling Earbuds and get 1 free!',
    discountValue: 100,
    buyQty: 2,
    getQty: 1,
    usageCount: 29,
    startDate: '2026-05-18',
    endDate: '2026-05-22',
    createdAt: '2026-05-17 14:00',
    updatedAt: '2026-05-19 06:00',
    totalRevenue: 4349.42,
    totalUnitsSold: 87,
    products: [
      { productId: 'P010', productName: 'Noise Cancelling Earbuds', sku: 'NCE-010', originalPrice: 74.99, currentStock: 88, expectedSalesPerDay: 15 },
    ],
  },
  {
    id: 'PROMO-004',
    name: 'RM 30 Off Smart Home',
    type: 'fixed_amount',
    status: 'scheduled',
    description: 'Get RM 30 off Smart Home Hub Device. Valid for orders above RM 80.',
    discountValue: 30,
    minOrderAmount: 80,
    maxUsageCount: 200,
    usageCount: 0,
    startDate: '2026-05-22',
    endDate: '2026-05-29',
    createdAt: '2026-05-19 09:00',
    updatedAt: '2026-05-19 09:00',
    totalRevenue: 0,
    totalUnitsSold: 0,
    products: [
      { productId: 'P012', productName: 'Smart Home Hub Device', sku: 'SHH-012', originalPrice: 99.00, currentStock: 34, expectedSalesPerDay: 6 },
    ],
  },
  {
    id: 'PROMO-005',
    name: 'Accessories Flash Sale — 15% Off',
    type: 'percentage',
    status: 'paused',
    description: '15% discount on all accessories. Paused pending stock replenishment.',
    discountValue: 15,
    usageCount: 67,
    startDate: '2026-05-12',
    endDate: '2026-05-20',
    createdAt: '2026-05-11 08:00',
    updatedAt: '2026-05-17 11:00',
    totalRevenue: 2890.00,
    totalUnitsSold: 89,
    products: [
      { productId: 'P003', productName: 'USB-C Charging Cable 2m', sku: 'UCC-003', originalPrice: 12.99, currentStock: 0, expectedSalesPerDay: 12 },
      { productId: 'P007', productName: 'Laptop Cooling Pad', sku: 'LCP-007', originalPrice: 34.99, currentStock: 5, expectedSalesPerDay: 4 },
      { productId: 'P011', productName: 'Portable Power Bank 20000mAh', sku: 'PPB-011', originalPrice: 59.99, currentStock: 12, expectedSalesPerDay: 6 },
    ],
  },
  {
    id: 'PROMO-006',
    name: 'May Day Furniture Fest',
    type: 'percentage',
    status: 'expired',
    description: '25% off ergonomic furniture for the entire month of May.',
    discountValue: 25,
    usageCount: 120,
    maxUsageCount: 150,
    startDate: '2026-05-01',
    endDate: '2026-05-10',
    createdAt: '2026-04-28 10:00',
    updatedAt: '2026-05-10 23:59',
    totalRevenue: 28500.00,
    totalUnitsSold: 120,
    products: [
      { productId: 'P002', productName: 'Ergonomic Office Chair', sku: 'EOC-002', originalPrice: 349.00, currentStock: 8, expectedSalesPerDay: 3 },
      { productId: 'P005', productName: 'Standing Desk Converter', sku: 'SDC-005', originalPrice: 199.50, currentStock: 3, expectedSalesPerDay: 2 },
    ],
  },
];