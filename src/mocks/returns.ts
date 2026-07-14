export type ReturnStatus = 'pending' | 'inspecting' | 'approved' | 'restocked' | 'discarded';
export type ReturnCondition = 'new' | 'good' | 'fair' | 'damaged' | 'defective';
export type ReturnReason = 'photoshoot' | 'excess' | 'damaged' | 'consignment' | 'other';

export interface ReturnItem {
  productId: string;
  productName: string;
  sku: string;
  imageUrl?: string | null;
  quantity: number;
  unitPrice: number;
  condition?: ReturnCondition;
}

export interface ReturnRequest {
  id: string;
  /** Staff member returning the stock — pulled from the linked request's "Requested By". */
  returnedBy: string;
  status: ReturnStatus;
  items: ReturnItem[];
  totalItems: number;
  /** Value of the returned stock, for internal tracking — not a customer refund. */
  totalValue: number;
  reason: ReturnReason;
  reasonNote?: string;
  warehouse: string;
  assignedTo?: string;
  inspectionNotes?: string;
  /** The stock request this return was created from — every return is linked to one. */
  requestId: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export const returnRequests: ReturnRequest[] = [
  {
    id: 'RET-0021',
    returnedBy: 'Zara Mitchell',
    status: 'pending',
    totalItems: 1,
    totalValue: 89.99,
    reason: 'photoshoot',
    reasonNote: 'Used for the May catalog shoot, ready to go back to stock.',
    warehouse: 'BM Warehouse',
    requestId: 'REQ-0142',
    createdAt: '2026-05-19 10:00',
    updatedAt: '2026-05-19 10:00',
    items: [
      { productId: 'P001', productName: 'Wireless Bluetooth Headphones', sku: 'WBH-001', quantity: 1, unitPrice: 89.99 },
    ],
  },
  {
    id: 'RET-0020',
    returnedBy: 'Ahmad Al-Rashid',
    status: 'inspecting',
    totalItems: 1,
    totalValue: 279.00,
    reason: 'damaged',
    reasonNote: 'Screen cracked while on set.',
    warehouse: 'BM Warehouse',
    assignedTo: 'Admin',
    inspectionNotes: 'Physical damage confirmed on corners. Screen defect verified.',
    requestId: 'REQ-0139',
    createdAt: '2026-05-18 14:30',
    updatedAt: '2026-05-19 09:00',
    items: [
      { productId: 'P006', productName: 'LED Monitor 27 inch', sku: 'LMN-006', quantity: 1, unitPrice: 279.00, condition: 'damaged' },
    ],
  },
  {
    id: 'RET-0019',
    returnedBy: 'Priya Nair',
    status: 'approved',
    totalItems: 2,
    totalValue: 259.98,
    reason: 'excess',
    reasonNote: 'Requested more than needed for the shoot.',
    warehouse: 'BM Warehouse',
    assignedTo: 'Admin',
    inspectionNotes: 'Items returned in original packaging, unused.',
    requestId: 'REQ-0131',
    createdAt: '2026-05-17 11:00',
    updatedAt: '2026-05-18 15:00',
    items: [
      { productId: 'P004', productName: 'Mechanical Keyboard RGB', sku: 'MKR-004', quantity: 1, unitPrice: 129.99, condition: 'new' },
      { productId: 'P008', productName: 'Webcam 4K Ultra HD', sku: 'WCM-008', quantity: 1, unitPrice: 159.99, condition: 'new' },
    ],
  },
  {
    id: 'RET-0018',
    returnedBy: 'Jason Tan',
    status: 'restocked',
    totalItems: 1,
    totalValue: 59.99,
    reason: 'consignment',
    reasonNote: 'Borrowed for a client demo, now returning.',
    warehouse: 'BM Warehouse',
    assignedTo: 'Admin',
    inspectionNotes: 'Item in pristine condition, restocked.',
    requestId: 'REQ-0120',
    createdAt: '2026-05-15 09:30',
    updatedAt: '2026-05-16 11:00',
    completedAt: '2026-05-16 11:00',
    items: [
      { productId: 'P011', productName: 'Portable Power Bank 20000mAh', sku: 'PPB-011', quantity: 1, unitPrice: 59.99, condition: 'new' },
    ],
  },
  {
    id: 'RET-0016',
    returnedBy: 'David Lim',
    status: 'discarded',
    totalItems: 1,
    totalValue: 349.00,
    reason: 'damaged',
    reasonNote: 'Chair frame cracked during the shoot.',
    warehouse: 'BM Warehouse',
    assignedTo: 'Admin',
    inspectionNotes: 'Structural damage beyond repair. Disposed.',
    requestId: 'REQ-0098',
    createdAt: '2026-05-10 13:00',
    updatedAt: '2026-05-12 09:00',
    completedAt: '2026-05-12 09:00',
    items: [
      { productId: 'P002', productName: 'Ergonomic Office Chair', sku: 'EOC-002', quantity: 1, unitPrice: 349.00, condition: 'damaged' },
    ],
  },
];
