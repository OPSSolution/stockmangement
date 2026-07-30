export interface BinStockRow {
  bin_location: string;
  quantity: number;
  /** Expiry of the batch currently sitting in this bin, if any. */
  expiry_date?: string | null;
}

/** Stable key for anything scoped to one product's stock at one warehouse — a product
 * can now have stock (and bins) in several warehouses at once, so `productId` alone is
 * no longer a unique key for grouping bin/history rows the way it used to be. */
export function binStockKey(productId: string, warehouse: string): string {
  return `${productId}::${warehouse}`;
}

/** Groups product_bin_stock rows by `productId::warehouse`, sorted ascending by
 * quantity — so the lowest-stock bin (the one to draw down first) is always first. */
export function groupBinStock(
  rows: { product_id: string; warehouse: string; bin_location: string; quantity: number; expiry_date?: string | null }[]
): Record<string, BinStockRow[]> {
  const map: Record<string, BinStockRow[]> = {};
  rows.forEach((row) => {
    const key = binStockKey(row.product_id, row.warehouse);
    (map[key] ??= []).push({ bin_location: row.bin_location, quantity: row.quantity, expiry_date: row.expiry_date });
  });
  Object.values(map).forEach((list) => list.sort((a, b) => a.quantity - b.quantity));
  return map;
}

/** The bin to default to when a product has more than one — lowest quantity first,
 * so it gets drawn down before fuller bins. Still just a default; the user can change it. */
export function lowestQuantityBin(bins: BinStockRow[] | undefined): string {
  return bins && bins.length > 0 ? bins[0].bin_location : '';
}

/** The expiry date tracked against one specific bin, if that bin is known and stocked. */
export function binExpiry(bins: BinStockRow[] | undefined, binLocation: string | undefined): string | null | undefined {
  if (!bins || !binLocation) return undefined;
  return bins.find((b) => b.bin_location === binLocation)?.expiry_date;
}

export interface BinOption {
  value: string;
  hint: string;
}

/** Combined bin choices for receiving stock: the product's own bins first (lowest
 * on hand first, so those get topped up before fuller ones), then any other bin the
 * warehouse has registered that this product isn't in yet — receiving can put stock
 * anywhere in the warehouse, not just where the product already sits. */
export function buildReceiveBinOptions(productBins: BinStockRow[] | undefined, warehouseBinLocations: string[] | undefined): BinOption[] {
  const sortedProductBins = [...(productBins ?? [])].sort((a, b) => a.quantity - b.quantity);
  const productBinLocations = new Set(sortedProductBins.map((b) => b.bin_location));
  const otherWarehouseBins = (warehouseBinLocations ?? [])
    .filter((b) => !productBinLocations.has(b))
    .sort((a, b) => a.localeCompare(b));
  return [
    ...sortedProductBins.map((b) => ({ value: b.bin_location, hint: `${b.quantity} on hand` })),
    ...otherWarehouseBins.map((b) => ({ value: b, hint: 'Empty' })),
  ];
}
