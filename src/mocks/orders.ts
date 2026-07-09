export type OrderStatus = 'pending' | 'accepted' | 'rejected' | 'partial' | 'processing' | 'fulfilled';
export type VendorOrderStatus = 'pending' | 'accepted' | 'rejected' | 'partial';

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  imageUrl?: string | null;
  quantity: number;
  unitPrice: number;
  availableQty: number;
  vendor: string;
  warehouse: string;
  status: 'pending' | 'accepted' | 'rejected';
}

export interface VendorSplit {
  vendor: string;
  warehouse: string;
  items: OrderItem[];
  status: VendorOrderStatus;
  subtotal: number;
}

export interface Order {
  id: string;
  requestedBy?: string;
  customer: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  createdAt: string;
  updatedAt: string;
  status: OrderStatus;
  total: number;
  itemCount: number;
  vendorSplits: VendorSplit[];
  notes?: string;
}

export const orders: Order[] = [
  {
    id: 'ORD-2845',
    customer: 'Zara Mitchell',
    email: 'zara.mitchell@email.com',
    phone: '+60 12-345 6789',
    address: '45, Jalan Ampang',
    city: 'Kuala Lumpur, MY',
    createdAt: '2026-05-19 13:00',
    updatedAt: '2026-05-19 13:00',
    status: 'pending',
    total: 549.97,
    itemCount: 5,
    vendorSplits: [
      {
        vendor: 'BM Warehouse',
        warehouse: 'BM Warehouse',
        status: 'pending',
        subtotal: 389.98,
        items: [
          { id: 'OI-001', productId: 'P001', productName: 'Wireless Bluetooth Headphones', sku: 'WBH-001', quantity: 2, unitPrice: 89.99, availableQty: 124, vendor: 'BM Warehouse', warehouse: 'BM Warehouse', status: 'pending' },
          { id: 'OI-002', productId: 'P004', productName: 'Mechanical Keyboard RGB', sku: 'MKR-004', quantity: 1, unitPrice: 129.99, availableQty: 45, vendor: 'BM Warehouse', warehouse: 'BM Warehouse', status: 'pending' },
          { id: 'OI-003', productId: 'P008', productName: 'Webcam 4K Ultra HD', sku: 'WCM-008', quantity: 1, unitPrice: 159.99, availableQty: 22, vendor: 'BM Warehouse', warehouse: 'BM Warehouse', status: 'pending' },
        ],
      },
      {
        vendor: 'CoolTech Inc.',
        warehouse: 'Vendor Warehouse',
        status: 'pending',
        subtotal: 34.99,
        items: [
          { id: 'OI-004', productId: 'P007', productName: 'Laptop Cooling Pad', sku: 'LCP-007', quantity: 1, unitPrice: 34.99, availableQty: 5, vendor: 'CoolTech Inc.', warehouse: 'Vendor Warehouse', status: 'pending' },
        ],
      },
    ],
    notes: 'Customer requested morning delivery.',
  },
  {
    id: 'ORD-2844',
    customer: 'Ahmed Al-Rashid',
    email: 'ahmed.rashid@email.com',
    phone: '+60 13-876 5432',
    address: '12, Persiaran Bestari',
    city: 'Shah Alam, MY',
    createdAt: '2026-05-19 11:45',
    updatedAt: '2026-05-19 12:10',
    status: 'partial',
    total: 489.48,
    itemCount: 4,
    vendorSplits: [
      {
        vendor: 'BM Warehouse',
        warehouse: 'BM Warehouse',
        status: 'accepted',
        subtotal: 279.00,
        items: [
          { id: 'OI-005', productId: 'P006', productName: 'LED Monitor 27 inch', sku: 'LMN-006', quantity: 1, unitPrice: 279.00, availableQty: 67, vendor: 'BM Warehouse', warehouse: 'BM Warehouse', status: 'accepted' },
        ],
      },
      {
        vendor: 'ErgoWorks Ltd.',
        warehouse: 'Vendor Warehouse',
        status: 'rejected',
        subtotal: 598.50,
        items: [
          { id: 'OI-006', productId: 'P005', productName: 'Standing Desk Converter', sku: 'SDC-005', quantity: 3, unitPrice: 199.50, availableQty: 3, vendor: 'ErgoWorks Ltd.', warehouse: 'Vendor Warehouse', status: 'rejected' },
        ],
      },
      {
        vendor: 'TechSupply Co.',
        warehouse: 'Vendor Warehouse',
        status: 'accepted',
        subtotal: 12.99,
        items: [
          { id: 'OI-007', productId: 'P003', productName: 'USB-C Charging Cable 2m', sku: 'UCC-003', quantity: 1, unitPrice: 12.99, availableQty: 0, vendor: 'TechSupply Co.', warehouse: 'Vendor Warehouse', status: 'rejected' },
        ],
      },
    ],
    notes: 'Vendor rejected items due to stock shortage.',
  },
  {
    id: 'ORD-2843',
    customer: 'Priya Nair',
    email: 'priya.nair@email.com',
    phone: '+60 11-234 5678',
    address: '78, Jalan SS2/4',
    city: 'Petaling Jaya, MY',
    createdAt: '2026-05-19 10:20',
    updatedAt: '2026-05-19 11:00',
    status: 'accepted',
    total: 224.98,
    itemCount: 2,
    vendorSplits: [
      {
        vendor: 'SoundWave Co.',
        warehouse: 'Vendor Warehouse',
        status: 'accepted',
        subtotal: 149.98,
        items: [
          { id: 'OI-008', productId: 'P010', productName: 'Noise Cancelling Earbuds', sku: 'NCE-010', quantity: 2, unitPrice: 74.99, availableQty: 88, vendor: 'SoundWave Co.', warehouse: 'Vendor Warehouse', status: 'accepted' },
        ],
      },
      {
        vendor: 'BM Warehouse',
        warehouse: 'BM Warehouse',
        status: 'accepted',
        subtotal: 59.99,
        items: [
          { id: 'OI-009', productId: 'P011', productName: 'Portable Power Bank 20000mAh', sku: 'PPB-011', quantity: 1, unitPrice: 59.99, availableQty: 12, vendor: 'BM Warehouse', warehouse: 'BM Warehouse', status: 'accepted' },
        ],
      },
    ],
  },
  {
    id: 'ORD-2842',
    customer: 'Jason Tan',
    email: 'jason.tan@email.com',
    phone: '+60 17-654 3210',
    address: '22, Jalan USJ 9/5',
    city: 'Subang Jaya, MY',
    createdAt: '2026-05-19 09:00',
    updatedAt: '2026-05-19 09:50',
    status: 'processing',
    total: 99.00,
    itemCount: 1,
    vendorSplits: [
      {
        vendor: 'SmartLife Corp.',
        warehouse: 'Vendor Warehouse',
        status: 'accepted',
        subtotal: 99.00,
        items: [
          { id: 'OI-010', productId: 'P012', productName: 'Smart Home Hub Device', sku: 'SHH-012', quantity: 1, unitPrice: 99.00, availableQty: 34, vendor: 'SmartLife Corp.', warehouse: 'Vendor Warehouse', status: 'accepted' },
        ],
      },
    ],
  },
  {
    id: 'ORD-2841',
    customer: 'Nurul Huda',
    email: 'nurul.huda@email.com',
    phone: '+60 16-998 7654',
    address: '9, Jalan Cheras Perdana',
    city: 'Cheras, MY',
    createdAt: '2026-05-18 16:30',
    updatedAt: '2026-05-18 17:00',
    status: 'fulfilled',
    total: 339.97,
    itemCount: 4,
    vendorSplits: [
      {
        vendor: 'BM Warehouse',
        warehouse: 'BM Warehouse',
        status: 'accepted',
        subtotal: 339.97,
        items: [
          { id: 'OI-011', productId: 'P001', productName: 'Wireless Bluetooth Headphones', sku: 'WBH-001', quantity: 2, unitPrice: 89.99, availableQty: 124, vendor: 'BM Warehouse', warehouse: 'BM Warehouse', status: 'accepted' },
          { id: 'OI-012', productId: 'P008', productName: 'Webcam 4K Ultra HD', sku: 'WCM-008', quantity: 1, unitPrice: 159.99, availableQty: 22, vendor: 'BM Warehouse', warehouse: 'BM Warehouse', status: 'accepted' },
        ],
      },
    ],
  },
  {
    id: 'ORD-2840',
    customer: 'David Lim',
    email: 'david.lim@email.com',
    phone: '+60 12-111 2233',
    address: '33, Jalan Duta',
    city: 'Kuala Lumpur, MY',
    createdAt: '2026-05-18 14:00',
    updatedAt: '2026-05-18 14:30',
    status: 'rejected',
    total: 699.50,
    itemCount: 2,
    vendorSplits: [
      {
        vendor: 'ErgoWorks Ltd.',
        warehouse: 'Vendor Warehouse',
        status: 'rejected',
        subtotal: 399.00,
        items: [
          { id: 'OI-013', productId: 'P005', productName: 'Standing Desk Converter', sku: 'SDC-005', quantity: 2, unitPrice: 199.50, availableQty: 3, vendor: 'ErgoWorks Ltd.', warehouse: 'Vendor Warehouse', status: 'rejected' },
        ],
      },
      {
        vendor: 'BM Warehouse',
        warehouse: 'BM Warehouse',
        status: 'rejected',
        subtotal: 349.00,
        items: [
          { id: 'OI-014', productId: 'P002', productName: 'Ergonomic Office Chair', sku: 'EOC-002', quantity: 1, unitPrice: 349.00, availableQty: 8, vendor: 'BM Warehouse', warehouse: 'BM Warehouse', status: 'rejected' },
        ],
      },
    ],
    notes: 'All vendors rejected due to insufficient stock.',
  },
];
