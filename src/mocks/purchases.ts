export type PurchaseStatus = 'draft' | 'submitted' | 'approved' | 'ordered' | 'received' | 'cancelled';

export interface PurchaseItem {
  productId: string;
  productName: string;
  sku: string;
  imageUrl?: string | null;
  orderedQty: number;
  receivedQty: number;
  unitCost: number;
}

export interface PurchaseOrder {
  id: string;
  vendor: string;
  vendorContact: string;
  vendorEmail: string;
  warehouse: 'BM Warehouse' | 'Vendor Warehouse';
  status: PurchaseStatus;
  items: PurchaseItem[];
  totalItems: number;
  subtotal: number;
  tax: number;
  total: number;
  requestedBy: string;
  approvedBy?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  expectedDelivery?: string;
  receivedAt?: string;
}

export const purchaseOrders: PurchaseOrder[] = [
  {
    id: 'PO-0198',
    vendor: 'TechSupply Co.',
    vendorContact: 'Kevin Lam',
    vendorEmail: 'kevin@techsupply.co',
    warehouse: 'BM Warehouse',
    status: 'submitted',
    totalItems: 200,
    subtotal: 2598.00,
    tax: 155.88,
    total: 2753.88,
    requestedBy: 'Admin',
    notes: 'Priority — out of stock item.',
    createdAt: '2026-05-19 10:00',
    updatedAt: '2026-05-19 10:00',
    expectedDelivery: '2026-05-23',
    items: [
      { productId: 'P003', productName: 'USB-C Charging Cable 2m', sku: 'UCC-003', orderedQty: 200, receivedQty: 0, unitCost: 12.99 },
    ],
  },
  {
    id: 'PO-0197',
    vendor: 'ErgoWorks Ltd.',
    vendorContact: 'Sandra Ng',
    vendorEmail: 'sandra@ergoworks.com',
    warehouse: 'BM Warehouse',
    status: 'approved',
    totalItems: 30,
    subtotal: 10485.00,
    tax: 629.10,
    total: 11114.10,
    requestedBy: 'Admin',
    approvedBy: 'Admin',
    notes: 'Bulk restock for Q2.',
    createdAt: '2026-05-18 09:00',
    updatedAt: '2026-05-18 14:00',
    expectedDelivery: '2026-05-25',
    items: [
      { productId: 'P002', productName: 'Ergonomic Office Chair', sku: 'EOC-002', orderedQty: 20, receivedQty: 0, unitCost: 280.00 },
      { productId: 'P005', productName: 'Standing Desk Converter', sku: 'SDC-005', orderedQty: 10, receivedQty: 0, unitCost: 168.75 },
    ],
  },
  {
    id: 'PO-0196',
    vendor: 'CoolTech Inc.',
    vendorContact: 'Raj Patel',
    vendorEmail: 'raj@cooltech.io',
    warehouse: 'Vendor Warehouse',
    status: 'ordered',
    totalItems: 50,
    subtotal: 875.00,
    tax: 52.50,
    total: 927.50,
    requestedBy: 'Admin',
    approvedBy: 'Admin',
    createdAt: '2026-05-17 11:00',
    updatedAt: '2026-05-18 08:00',
    expectedDelivery: '2026-05-22',
    items: [
      { productId: 'P007', productName: 'Laptop Cooling Pad', sku: 'LCP-007', orderedQty: 50, receivedQty: 0, unitCost: 17.50 },
    ],
  },
  {
    id: 'PO-0195',
    vendor: 'SoundWave Co.',
    vendorContact: 'Michelle Tan',
    vendorEmail: 'michelle@soundwave.co',
    warehouse: 'Vendor Warehouse',
    status: 'received',
    totalItems: 100,
    subtotal: 5250.00,
    tax: 315.00,
    total: 5565.00,
    requestedBy: 'Admin',
    approvedBy: 'Admin',
    notes: 'Monthly replenishment order.',
    createdAt: '2026-05-14 09:00',
    updatedAt: '2026-05-17 10:30',
    expectedDelivery: '2026-05-17',
    receivedAt: '2026-05-17 10:30',
    items: [
      { productId: 'P010', productName: 'Noise Cancelling Earbuds', sku: 'NCE-010', orderedQty: 100, receivedQty: 100, unitCost: 52.50 },
    ],
  },
  {
    id: 'PO-0194',
    vendor: 'SmartLife Corp.',
    vendorContact: 'David Chen',
    vendorEmail: 'david@smartlife.io',
    warehouse: 'Vendor Warehouse',
    status: 'received',
    totalItems: 60,
    subtotal: 4140.00,
    tax: 248.40,
    total: 4388.40,
    requestedBy: 'Admin',
    approvedBy: 'Admin',
    createdAt: '2026-05-12 08:00',
    updatedAt: '2026-05-15 15:00',
    expectedDelivery: '2026-05-15',
    receivedAt: '2026-05-15 15:00',
    items: [
      { productId: 'P012', productName: 'Smart Home Hub Device', sku: 'SHH-012', orderedQty: 60, receivedQty: 60, unitCost: 69.00 },
    ],
  },
  {
    id: 'PO-0193',
    vendor: 'TechSupply Co.',
    vendorContact: 'Kevin Lam',
    vendorEmail: 'kevin@techsupply.co',
    warehouse: 'BM Warehouse',
    status: 'cancelled',
    totalItems: 50,
    subtotal: 649.50,
    tax: 38.97,
    total: 688.47,
    requestedBy: 'Admin',
    notes: 'Vendor unable to supply — cancelled and reordered.',
    createdAt: '2026-05-10 10:00',
    updatedAt: '2026-05-11 09:00',
    items: [
      { productId: 'P003', productName: 'USB-C Charging Cable 2m', sku: 'UCC-003', orderedQty: 50, receivedQty: 0, unitCost: 12.99 },
    ],
  },
  {
    id: 'PO-0192',
    vendor: 'BM Warehouse',
    vendorContact: 'Internal',
    vendorEmail: 'warehouse@bm.io',
    warehouse: 'BM Warehouse',
    status: 'received',
    totalItems: 20,
    subtotal: 5580.00,
    tax: 334.80,
    total: 5914.80,
    requestedBy: 'Admin',
    approvedBy: 'Admin',
    createdAt: '2026-05-08 09:00',
    updatedAt: '2026-05-10 11:00',
    expectedDelivery: '2026-05-10',
    receivedAt: '2026-05-10 11:00',
    items: [
      { productId: 'P006', productName: 'LED Monitor 27 inch', sku: 'LMN-006', orderedQty: 20, receivedQty: 20, unitCost: 279.00 },
    ],
  },
];