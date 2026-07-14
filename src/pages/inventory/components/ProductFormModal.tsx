import { useState, useEffect } from 'react';
import type { Product, ProductType } from '@/mocks/inventory';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface ProductFormModalProps {
  product: Product | null;
  nextNum: number;
  onClose: () => void;
  onSave: (data: Omit<Product, 'id' | 'status' | 'lastUpdated'> & { id?: string }) => void;
}

const CATEGORY_STORAGE_KEY = 'inventory_categories';
const DEFAULT_CATEGORIES = ['Electronics', 'Furniture', 'Accessories', 'Lighting', 'Smart Home'];
const productTypes = ['kg', 'pack', 'box', 'piece', 'liter', 'meter', 'bottle', 'bundle'] as const;

function autoSku(name: string, nextNum: number) {
  const prefix = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'PRD';

  return `${prefix}-${String(nextNum).padStart(3, '0')}`;
}

type ProductFormState = Omit<Product, 'id' | 'status' | 'lastUpdated'>;

export default function ProductFormModal({ product, nextNum, onClose, onSave }: ProductFormModalProps) {
  const { warehouseScope } = useAuth();
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [warehouseVendors, setWarehouseVendors] = useState<Record<string, string[]>>({});
  const [skuManuallyEdited, setSkuManuallyEdited] = useState(Boolean(product));
  const [form, setForm] = useState<ProductFormState>({
    name: '',
    sku: '',
    category: 'Electronics',
    warehouse: '',
    vendor: '',
    stock: 0,
    lowStockThreshold: 10,
    price: 0,
    productType: 'pack' as ProductType,
  });

  useEffect(() => {
    const stored = localStorage.getItem(CATEGORY_STORAGE_KEY);
    if (!stored) return;

    try {
      const parsed = JSON.parse(stored) as string[];
      if (Array.isArray(parsed) && parsed.length > 0) setCategories(parsed);
    } catch {
      localStorage.removeItem(CATEGORY_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const loadWarehouses = async () => {
      const { data, error } = await supabase.from('warehouses').select('name, vendor_names').order('name', { ascending: true });
      if (!error && data && data.length > 0) {
        const names = data.map((w) => w.name as string);
        setWarehouses(names);
        setWarehouseVendors(Object.fromEntries(data.map((w) => [w.name as string, (w.vendor_names as string[]) || []])));
        setForm((prev) => (prev.warehouse ? prev : { ...prev, warehouse: warehouseScope?.[0] || names[0] }));
      }
    };
    loadWarehouses();
  }, [warehouseScope]);

  const vendorOptions = warehouseVendors[form.warehouse] || [];

  useEffect(() => {
    if (product) {
      setForm({
        name: product.name,
        sku: product.sku,
        category: product.category,
        warehouse: product.warehouse,
        vendor: product.vendor ?? '',
        stock: product.stock,
        lowStockThreshold: product.lowStockThreshold,
        price: product.price,
        productType: product.productType,
        imageUrl: product.imageUrl,
      });
      setSkuManuallyEdited(true);
    } else {
      setForm((prev) => ({
        ...prev,
        sku: skuManuallyEdited ? prev.sku : autoSku(prev.name, nextNum),
      }));
    }
  }, [product, nextNum, skuManuallyEdited]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;

    if (name === 'sku') {
      setSkuManuallyEdited(true);
      setForm(prev => ({ ...prev, sku: value }));
      return;
    }

    setForm(prev => {
      const updated: ProductFormState = {
        ...prev,
        [name]: name === 'stock' || name === 'lowStockThreshold' || name === 'price'
          ? parseFloat(value) || 0
          : value,
      };
      // Auto-generate SKU when name changes (unless user manually edited SKU)
      if (name === 'name' && !skuManuallyEdited) {
        updated.sku = autoSku(value, nextNum);
      }
      return updated;
    });
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setForm((prev) => ({ ...prev, imageUrl: String(reader.result || '') }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSave({ ...form, id: product?.id });
  };

  const totalValue = form.price * form.stock;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl flex flex-col max-h-[90dvh]">

        {/* Sticky header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900">{product ? 'Edit Product' : 'Add New Product'}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{product ? `Editing: ${product.name}` : 'Fill in the details below'}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 cursor-pointer">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">

            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Product Name</label>
              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                required
                placeholder="e.g. Wireless Keyboard"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">SKU</label>
              <input
                name="sku"
                value={form.sku}
                onChange={handleChange}
                required
                placeholder="e.g. WKB-015"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Category</label>
              <select
                name="category"
                value={form.category}
                onChange={handleChange}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 cursor-pointer"
              >
                {categories.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Warehouse</label>
              {warehouseScope && warehouseScope.length === 1 ? (
                <input
                  value={warehouseScope[0]}
                  disabled
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-500"
                />
              ) : (
                <select
                  name="warehouse"
                  value={form.warehouse}
                  onChange={handleChange}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 cursor-pointer"
                >
                  {(warehouseScope || warehouses).map((w) => <option key={w}>{w}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Vendor (optional)</label>
              <select
                name="vendor"
                value={form.vendor}
                onChange={handleChange}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 cursor-pointer"
              >
                <option value="">None</option>
                {vendorOptions.map((v) => <option key={v} value={v}>{v}</option>)}
                {form.vendor && !vendorOptions.includes(form.vendor) && <option value={form.vendor}>{form.vendor}</option>}
              </select>
              {vendorOptions.length === 0 && (
                <p className="text-[11px] text-gray-400 mt-1">No vendors approved for this warehouse yet — add some from the warehouse's detail page.</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Initial Stock</label>
              <input
                type="number"
                name="stock"
                value={form.stock}
                onChange={handleChange}
                min={0}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Low Stock Threshold</label>
              <input
                type="number"
                name="lowStockThreshold"
                value={form.lowStockThreshold}
                onChange={handleChange}
                min={1}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Price (RM)</label>
              <input
                type="number"
                name="price"
                value={form.price}
                onChange={handleChange}
                min={0}
                step={0.01}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Product Type</label>
              <select
                name="productType"
                value={form.productType}
                onChange={handleChange}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 cursor-pointer"
              >
                {productTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

                        {/* Image upload */}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Product Image (optional)</label>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center overflow-hidden shrink-0">
                  {form.imageUrl ? (
                    <img src={form.imageUrl} alt="preview" className="w-full h-full object-cover" />
                  ) : (
                    <i className="ri-image-line text-gray-300 text-3xl"></i>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg cursor-pointer hover:bg-emerald-100 transition-colors w-fit">
                    <i className="ri-upload-line"></i>
                    {form.imageUrl ? 'Change Image' : 'Upload Image'}
                    <input type="file" accept="image/*" className="hidden" onChange={handleFilePick} />
                  </label>
                  {form.imageUrl && (
                    <button
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, imageUrl: undefined }))}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-500 hover:text-red-600 cursor-pointer w-fit"
                    >
                      <i className="ri-delete-bin-line"></i> Remove
                    </button>
                  )}
                  <p className="text-xs text-gray-400">PNG, JPG, WEBP up to 5 MB</p>
                </div>
              </div>
            </div>
          </div>
          </div>

          {/* Sticky footer */}
          <div className="flex items-center gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-colors cursor-pointer whitespace-nowrap"
            >
              {product ? 'Save Changes' : 'Add Product'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
