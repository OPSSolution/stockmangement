export type TransferStatus = 'requested' | 'approved' | 'in_transit' | 'received' | 'cancelled';

export interface TransferItem {
  productId: string;
  productName: string;
  sku: string;
  imageUrl?: string | null;
  quantity: number;
  unitPrice: number;
}

export interface StockTransfer {
  id: string;
  fromWarehouse: string;
  toWarehouse: string;
  requestedBy: string;
  approvedBy?: string;
  status: TransferStatus;
  items: TransferItem[];
  totalItems: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  expectedArrival?: string;
  completedAt?: string;
  reason: string;
}

export const transfers: StockTransfer[] = [
  {
    id: 'TRF-0051',
    fromWarehouse: 'Vendor Warehouse',
    toWarehouse: 'BM Warehouse',
    requestedBy: 'Admin',
    approvedBy: 'Admin',
    status: 'in_transit',
    totalItems: 30,
    reason: 'Restock low inventory',
    notes: 'Urgent — earbuds running low at BM.',
    createdAt: '2026-05-19 08:00',
    updatedAt: '2026-05-19 09:30',
    expectedArrival: '2026-05-20',
    items: [
      { productId: 'P010', productName: 'Noise Cancelling Earbuds', sku: 'NCE-010', quantity: 30, unitPrice: 74.99 },
    ],
  },
  {
    id: 'TRF-0050',
    fromWarehouse: 'BM Warehouse',
    toWarehouse: 'Vendor Warehouse',
    requestedBy: 'SoundWave Co.',
    approvedBy: 'Admin',
    status: 'received',
    totalItems: 50,
    reason: 'Vendor needs display stock',
    createdAt: '2026-05-18 14:00',
    updatedAt: '2026-05-19 07:45',
    expectedArrival: '2026-05-19',
    completedAt: '2026-05-19 07:45',
    items: [
      { productId: 'P004', productName: 'Mechanical Keyboard RGB', sku: 'MKR-004', quantity: 20, unitPrice: 129.99 },
      { productId: 'P001', productName: 'Wireless Bluetooth Headphones', sku: 'WBH-001', quantity: 30, unitPrice: 89.99 },
    ],
  },
  {
    id: 'TRF-0049',
    fromWarehouse: 'Vendor Warehouse',
    toWarehouse: 'BM Warehouse',
    requestedBy: 'Admin',
    status: 'requested',
    totalItems: 15,
    reason: 'Restock cooling pads',
    notes: 'CoolTech vendor confirmed availability.',
    createdAt: '2026-05-19 11:00',
    updatedAt: '2026-05-19 11:00',
    expectedArrival: '2026-05-21',
    items: [
      { productId: 'P007', productName: 'Laptop Cooling Pad', sku: 'LCP-007', quantity: 15, unitPrice: 34.99 },
    ],
  },
  {
    id: 'TRF-0048',
    fromWarehouse: 'BM Warehouse',
    toWarehouse: 'Vendor Warehouse',
    requestedBy: 'Admin',
    approvedBy: 'Admin',
    status: 'approved',
    totalItems: 25,
    reason: 'Vendor campaign stock allocation',
    createdAt: '2026-05-19 09:15',
    updatedAt: '2026-05-19 10:00',
    expectedArrival: '2026-05-21',
    items: [
      { productId: 'P006', productName: 'LED Monitor 27 inch', sku: 'LMN-006', quantity: 10, unitPrice: 279.00 },
      { productId: 'P008', productName: 'Webcam 4K Ultra HD', sku: 'WCM-008', quantity: 15, unitPrice: 159.99 },
    ],
  },
  {
    id: 'TRF-0047',
    fromWarehouse: 'Vendor Warehouse',
    toWarehouse: 'BM Warehouse',
    requestedBy: 'Admin',
    status: 'cancelled',
    totalItems: 100,
    reason: 'Emergency restock — cables out of stock',
    notes: 'Cancelled — vendor unable to fulfill at this time.',
    createdAt: '2026-05-17 10:00',
    updatedAt: '2026-05-17 14:00',
    items: [
      { productId: 'P003', productName: 'USB-C Charging Cable 2m', sku: 'UCC-003', quantity: 100, unitPrice: 12.99 },
    ],
  },
  {
    id: 'TRF-0046',
    fromWarehouse: 'Vendor Warehouse',
    toWarehouse: 'BM Warehouse',
    requestedBy: 'Admin',
    approvedBy: 'Admin',
    status: 'received',
    totalItems: 40,
    reason: 'Monthly restock cycle',
    createdAt: '2026-05-15 09:00',
    updatedAt: '2026-05-16 11:30',
    completedAt: '2026-05-16 11:30',
    expectedArrival: '2026-05-16',
    items: [
      { productId: 'P012', productName: 'Smart Home Hub Device', sku: 'SHH-012', quantity: 20, unitPrice: 99.00 },
      { productId: 'P005', productName: 'Standing Desk Converter', sku: 'SDC-005', quantity: 10, unitPrice: 199.50 },
      { productId: 'P011', productName: 'Portable Power Bank 20000mAh', sku: 'PPB-011', quantity: 10, unitPrice: 59.99 },
    ],
  },
];