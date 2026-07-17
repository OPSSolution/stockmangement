export type StockChangeType = 'sale' | 'purchase' | 'transfer_in' | 'transfer_out' | 'return' | 'adjustment' | 'request';

export interface StockHistoryEntry {
  id: string;
  productId: string;
  type: StockChangeType;
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  reference: string;
  note: string;
  warehouse: string;
  user: string;
  timestamp: string;
}

export const stockHistory: StockHistoryEntry[] = [
  { id: 'SH-001', productId: 'P001', type: 'sale', quantity: -5, stockBefore: 129, stockAfter: 124, reference: 'ORD-2841', note: 'Order #ORD-2841 dispatched', warehouse: 'BM Warehouse', user: 'Admin', timestamp: '2026-05-19 11:30' },
  { id: 'SH-002', productId: 'P001', type: 'purchase', quantity: 50, stockBefore: 79, stockAfter: 129, reference: 'PO-0188', note: 'Purchase order received', warehouse: 'BM Warehouse', user: 'Admin', timestamp: '2026-05-17 09:00' },
  { id: 'SH-003', productId: 'P001', type: 'return', quantity: 2, stockBefore: 77, stockAfter: 79, reference: 'RET-0031', note: 'Customer return — defective unit replaced', warehouse: 'BM Warehouse', user: 'Admin', timestamp: '2026-05-16 14:20' },
  { id: 'SH-004', productId: 'P001', type: 'adjustment', quantity: -3, stockBefore: 80, stockAfter: 77, reference: 'ADJ-0019', note: 'Stock count correction', warehouse: 'BM Warehouse', user: 'Admin', timestamp: '2026-05-15 10:00' },
  { id: 'SH-005', productId: 'P002', type: 'sale', quantity: -2, stockBefore: 10, stockAfter: 8, reference: 'ORD-2835', note: 'Order #ORD-2835 fulfilled', warehouse: 'BM Warehouse', user: 'Admin', timestamp: '2026-05-19 08:30' },
  { id: 'SH-006', productId: 'P002', type: 'purchase', quantity: 5, stockBefore: 5, stockAfter: 10, reference: 'PO-0183', note: 'Partial purchase order received', warehouse: 'BM Warehouse', user: 'Admin', timestamp: '2026-05-18 11:00' },
  { id: 'SH-007', productId: 'P003', type: 'sale', quantity: -10, stockBefore: 10, stockAfter: 0, reference: 'ORD-2830', note: 'Order fulfilled — now out of stock', warehouse: 'Vendor Warehouse', user: 'TechSupply Co.', timestamp: '2026-05-18 22:00' },
  { id: 'SH-008', productId: 'P004', type: 'sale', quantity: -3, stockBefore: 48, stockAfter: 45, reference: 'ORD-2840', note: 'Order #ORD-2840 fulfilled', warehouse: 'BM Warehouse', user: 'Admin', timestamp: '2026-05-19 08:20' },
  { id: 'SH-009', productId: 'P004', type: 'transfer_in', quantity: 20, stockBefore: 28, stockAfter: 48, reference: 'TRF-0040', note: 'Transfer from Vendor Warehouse', warehouse: 'BM Warehouse', user: 'Admin', timestamp: '2026-05-18 15:00' },
  { id: 'SH-010', productId: 'P005', type: 'adjustment', quantity: -7, stockBefore: 10, stockAfter: 3, reference: 'ADJ-0020', note: 'Stock sold outside platform — correction', warehouse: 'Vendor Warehouse', user: 'ErgoWorks Ltd.', timestamp: '2026-05-19 08:50' },
  { id: 'SH-011', productId: 'P006', type: 'purchase', quantity: 20, stockBefore: 47, stockAfter: 67, reference: 'PO-0192', note: 'Purchase Order #PO-0192 received', warehouse: 'BM Warehouse', user: 'Admin', timestamp: '2026-05-19 10:15' },
  { id: 'SH-012', productId: 'P007', type: 'sale', quantity: -15, stockBefore: 20, stockAfter: 5, reference: 'ORD-2828', note: 'Bulk order fulfilled', warehouse: 'Vendor Warehouse', user: 'CoolTech Inc.', timestamp: '2026-05-18 16:00' },
  { id: 'SH-013', productId: 'P010', type: 'transfer_in', quantity: 30, stockBefore: 58, stockAfter: 88, reference: 'TRF-0044', note: 'Transfer from Vendor to BM Warehouse', warehouse: 'Vendor Warehouse', user: 'SoundWave Co.', timestamp: '2026-05-19 09:45' },
  { id: 'SH-014', productId: 'P011', type: 'sale', quantity: -8, stockBefore: 20, stockAfter: 12, reference: 'ORD-2836', note: 'Order fulfilled', warehouse: 'BM Warehouse', user: 'Admin', timestamp: '2026-05-19 08:00' },
];