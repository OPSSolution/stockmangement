export interface StockReceiveItem {
  productId: string;
  productName: string;
  sku: string;
  imageUrl?: string | null;
  quantity: number;
  /** Where this item was put away — any bin in the warehouse, not just one the product already sits in. */
  binLocation?: string;
  /** Expiry of the batch received, if tracked. */
  expiryDate?: string;
}

export interface StockReceive {
  id: string;
  warehouse: string;
  /** Who supplied the stock — informational only, not linked to the vendors table. */
  vendor?: string;
  /** Supplier invoice / delivery order / DO number, if there is one. */
  reference?: string;
  notes?: string;
  items: StockReceiveItem[];
  totalItems: number;
  receivedBy: string;
  createdAt: string;
}
