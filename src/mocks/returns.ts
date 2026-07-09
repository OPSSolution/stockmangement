export type ReturnStatus = 'pending' | 'inspecting' | 'approved' | 'restocked' | 'discarded' | 'refunded' | 'returned';
export type ReturnCondition = 'new' | 'good' | 'fair' | 'damaged' | 'defective';
export type ReturnReason = 'wrong_item' | 'damaged' | 'defective' | 'not_as_described' | 'changed_mind' | 'other';
export type ReturnDecision = 'restock' | 'discard' | 'pending';
export type RefundMethod = 'original_payment' | 'store_credit' | 'bank_transfer' | 'none';

export interface ReturnItem {
  productId: string;
  productName: string;
  sku: string;
  imageUrl?: string | null;
  quantity: number;
  unitPrice: number;
  condition?: ReturnCondition;
  decision?: ReturnDecision;
}

export interface ReturnRequest {
  id: string;
  orderId: string;
  customer: string;
  email: string;
  phone: string;
  status: ReturnStatus;
  items: ReturnItem[];
  totalItems: number;
  totalValue: number;
  reason: ReturnReason;
  reasonNote?: string;
  refundMethod: RefundMethod;
  refundAmount: number;
  warehouse: string;
  assignedTo?: string;
  inspectionNotes?: string;
  /** If set, this return was created from a stock request flagged "needs return". */
  requestId?: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export const returnRequests: ReturnRequest[] = [
  {
    id: 'RET-0021',
    orderId: 'ORD-2835',
    customer: 'Zara Mitchell',
    email: 'zara.mitchell@email.com',
    phone: '+60 12-345 6789',
    status: 'pending',
    totalItems: 1,
    totalValue: 89.99,
    reason: 'defective',
    reasonNote: 'Left earcup stopped working after 3 days.',
    refundMethod: 'original_payment',
    refundAmount: 89.99,
    warehouse: 'BM Warehouse',
    createdAt: '2026-05-19 10:00',
    updatedAt: '2026-05-19 10:00',
    items: [
      { productId: 'P001', productName: 'Wireless Bluetooth Headphones', sku: 'WBH-001', quantity: 1, unitPrice: 89.99 },
    ],
  },
  {
    id: 'RET-0020',
    orderId: 'ORD-2830',
    customer: 'Ahmad Al-Rashid',
    email: 'ahmed.rashid@email.com',
    phone: '+60 13-876 5432',
    status: 'inspecting',
    totalItems: 1,
    totalValue: 279.00,
    reason: 'damaged',
    reasonNote: 'Screen has dead pixels on arrival.',
    refundMethod: 'store_credit',
    refundAmount: 279.00,
    warehouse: 'BM Warehouse',
    assignedTo: 'Admin',
    inspectionNotes: 'Physical damage confirmed on corners. Screen defect verified.',
    createdAt: '2026-05-18 14:30',
    updatedAt: '2026-05-19 09:00',
    items: [
      { productId: 'P006', productName: 'LED Monitor 27 inch', sku: 'LMN-006', quantity: 1, unitPrice: 279.00, condition: 'damaged' },
    ],
  },
  {
    id: 'RET-0019',
    orderId: 'ORD-2828',
    customer: 'Priya Nair',
    email: 'priya.nair@email.com',
    phone: '+60 11-234 5678',
    status: 'approved',
    totalItems: 2,
    totalValue: 259.98,
    reason: 'changed_mind',
    reasonNote: 'No longer needed — purchased from a physical store instead.',
    refundMethod: 'bank_transfer',
    refundAmount: 259.98,
    warehouse: 'BM Warehouse',
    assignedTo: 'Admin',
    inspectionNotes: 'Items returned in original packaging. Sealed boxes.',
    createdAt: '2026-05-17 11:00',
    updatedAt: '2026-05-18 15:00',
    items: [
      { productId: 'P004', productName: 'Mechanical Keyboard RGB', sku: 'MKR-004', quantity: 1, unitPrice: 129.99, condition: 'new', decision: 'restock' },
      { productId: 'P008', productName: 'Webcam 4K Ultra HD', sku: 'WCM-008', quantity: 1, unitPrice: 159.99, condition: 'new', decision: 'restock' },
    ],
  },
  {
    id: 'RET-0018',
    orderId: 'ORD-2820',
    customer: 'Jason Tan',
    email: 'jason.tan@email.com',
    phone: '+60 17-654 3210',
    status: 'restocked',
    totalItems: 1,
    totalValue: 59.99,
    reason: 'wrong_item',
    reasonNote: 'Received 10000mAh instead of 20000mAh.',
    refundMethod: 'original_payment',
    refundAmount: 59.99,
    warehouse: 'BM Warehouse',
    assignedTo: 'Admin',
    inspectionNotes: 'Confirmed wrong item shipped. Item in pristine condition.',
    createdAt: '2026-05-15 09:30',
    updatedAt: '2026-05-16 11:00',
    completedAt: '2026-05-16 11:00',
    items: [
      { productId: 'P011', productName: 'Portable Power Bank 20000mAh', sku: 'PPB-011', quantity: 1, unitPrice: 59.99, condition: 'new', decision: 'restock' },
    ],
  },
  {
    id: 'RET-0017',
    orderId: 'ORD-2815',
    customer: 'Linda Chong',
    email: 'linda.chong@email.com',
    phone: '+60 12-777 8899',
    status: 'refunded',
    totalItems: 1,
    totalValue: 74.99,
    reason: 'defective',
    reasonNote: 'Earbuds not charging, battery died after 1 week.',
    refundMethod: 'original_payment',
    refundAmount: 74.99,
    warehouse: 'Vendor Warehouse',
    assignedTo: 'Admin',
    inspectionNotes: 'Battery defect confirmed. Sent to vendor for disposal.',
    createdAt: '2026-05-12 08:00',
    updatedAt: '2026-05-14 10:00',
    completedAt: '2026-05-14 10:00',
    items: [
      { productId: 'P010', productName: 'Noise Cancelling Earbuds', sku: 'NCE-010', quantity: 1, unitPrice: 74.99, condition: 'defective', decision: 'discard' },
    ],
  },
  {
    id: 'RET-0016',
    orderId: 'ORD-2810',
    customer: 'David Lim',
    email: 'david.lim@email.com',
    phone: '+60 12-111 2233',
    status: 'discarded',
    totalItems: 1,
    totalValue: 349.00,
    reason: 'damaged',
    reasonNote: 'Chair frame cracked during delivery.',
    refundMethod: 'store_credit',
    refundAmount: 349.00,
    warehouse: 'BM Warehouse',
    assignedTo: 'Admin',
    inspectionNotes: 'Structural damage beyond repair. Disposed.',
    createdAt: '2026-05-10 13:00',
    updatedAt: '2026-05-12 09:00',
    completedAt: '2026-05-12 09:00',
    items: [
      { productId: 'P002', productName: 'Ergonomic Office Chair', sku: 'EOC-002', quantity: 1, unitPrice: 349.00, condition: 'damaged', decision: 'discard' },
    ],
  },
  {
    id: 'RET-0015',
    orderId: 'ORD-2800',
    customer: 'Nurul Huda',
    email: 'nurul.huda@email.com',
    phone: '+60 16-998 7654',
    status: 'refunded',
    totalItems: 2,
    totalValue: 99.98,
    reason: 'not_as_described',
    reasonNote: 'USB-C cable is 1m not 2m as listed.',
    refundMethod: 'bank_transfer',
    refundAmount: 99.98,
    warehouse: 'Vendor Warehouse',
    assignedTo: 'Admin',
    inspectionNotes: 'Product mislabeled. Both units discarded.',
    createdAt: '2026-05-08 10:00',
    updatedAt: '2026-05-09 14:00',
    completedAt: '2026-05-09 14:00',
    items: [
      { productId: 'P003', productName: 'USB-C Charging Cable 2m', sku: 'UCC-003', quantity: 2, unitPrice: 12.99, condition: 'fair', decision: 'discard' },
    ],
  },
];