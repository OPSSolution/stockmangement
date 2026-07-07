import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import DashboardLayout from '@/components/feature/DashboardLayout';
import ProductTable from './components/ProductTable';
import ProductFormModal from './components/ProductFormModal';
import StockAdjustModal from './components/StockAdjustModal';
import StockHistoryModal from './components/StockHistoryModal';
import DeleteConfirmModal from './components/DeleteConfirmModal';
import { Product } from '@/mocks/inventory';
import { StockHistoryEntry } from '@/mocks/stockHistory';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';
import { useCurrency } from '@/contexts/CurrencyContext';

const CATEGORY_STORAGE_KEY = 'inventory_categories';

type FilterStatus = 'all' | 'in_stock' | 'low_stock' | 'out_of_stock';

function deriveStatus(stock: number, threshold: number): Product['status'] {
  if (stock === 0) return 'out_of_stock';
  if (stock <= threshold) return 'low_stock';
  return 'in_stock';
}

function mapProduct(row: Record<string, unknown>): Product {
  return {
    id: row.id as string,
    name: row.name as string,
    sku: row.sku as string,
    category: row.category as string,
    warehouse: row.warehouse as string,
    vendor: row.vendor as string | undefined,
    imageUrl: (row.image_url as string) || undefined,
    stock: row.stock as number,
    lowStockThreshold: row.low_stock_threshold as number,
    price: row.price as number,
    productType: (row.product_type as Product['productType']) || 'pack',
    status: row.status as Product['status'],
    lastUpdated: row.last_updated as string,
  };
}

function mapHistory(row: Record<string, unknown>): StockHistoryEntry {
  return {
    id: row.id as string,
    productId: row.product_id as string,
    type: row.type as StockHistoryEntry['type'],
    quantity: row.quantity as number,
    stockBefore: row.stock_before as number,
    stockAfter: row.stock_after as number,
    reference: row.reference as string,
    note: (row.note as string) || '',
    warehouse: row.warehouse as string,
    user: row.user_name as string,
    timestamp: row.created_at as string,
  };
}

export default function InventoryPage() {
  const navigate = useNavigate();
  const { formatAmount } = useCurrency();
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [history, setHistory] = useState<StockHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterWarehouse, setFilterWarehouse] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [categories, setCategories] = useState<string[]>(['Electronics', 'Furniture', 'Accessories', 'Lighting', 'Smart Home']);
  const [warehouses, setWarehouses] = useState<string[]>([]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null);
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);
  const [deleteProduct, setDeleteProduct] = useState<Product | null>(null);

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const loadCategories = async () => {
      const { data } = await supabase.from('categories').select('name').order('name', { ascending: true });
      if (data && data.length > 0) {
        setCategories(data.map((item) => item.name));
        localStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(data.map((item) => item.name)));
      } else {
        const stored = localStorage.getItem(CATEGORY_STORAGE_KEY);
        if (stored) {
          try {
            const parsed = JSON.parse(stored) as string[];
            if (Array.isArray(parsed) && parsed.length > 0) setCategories(parsed);
          } catch {
            localStorage.removeItem(CATEGORY_STORAGE_KEY);
          }
        }
      }
    };

    const loadWarehouses = async () => {
      const { data } = await supabase.from('warehouses').select('name').order('name', { ascending: true });
      if (data) setWarehouses(data.map((w) => w.name as string));
    };

    loadCategories();
    loadWarehouses();
    fetchProducts();
    fetchHistory();
  }, []);

  // Auto-open add modal when navigated with ?action=add
  useEffect(() => {
    if (searchParams.get('action') === 'add') {
      setShowAddModal(true);
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Auto-open stock adjust modal when navigated with ?restock=ID
  useEffect(() => {
    const restockId = searchParams.get('restock');
    if (restockId && products.length > 0) {
      const target = products.find((p) => p.id === restockId);
      if (target) {
        setAdjustProduct(target);
        searchParams.delete('restock');
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [products, searchParams, setSearchParams]);

  const fetchProducts = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('products').select('*').order('last_updated', { ascending: false });
    if (error) {
      console.error(error);
      showToast('Failed to load products.', 'error');
    } else {
      setProducts((data || []).map(mapProduct));
    }
    setLoading(false);
  };

  const fetchHistory = async () => {
    const { data, error } = await supabase.from('stock_history').select('*').order('created_at', { ascending: false });
    if (error) console.error(error);
    else setHistory((data || []).map(mapHistory));
  };

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase());
      const matchStatus = filterStatus === 'all' || p.status === filterStatus;
      const matchWarehouse = filterWarehouse === 'all' || p.warehouse === filterWarehouse;
      const matchCategory = filterCategory === 'all' || p.category === filterCategory;
      return matchSearch && matchStatus && matchWarehouse && matchCategory;
    });
  }, [products, search, filterStatus, filterWarehouse, filterCategory]);

  const availableCategories = useMemo(() => {
    const fromProducts = [...new Set(products.map((p) => p.category))];
    return [...new Set([ ...categories, ...fromProducts ])];
  }, [categories, products]);

  const availableWarehouses = useMemo(() => {
    return [...new Set([ ...warehouses, ...products.map((p) => p.warehouse) ])];
  }, [warehouses, products]);

  const handleSaveProduct = async (data: Omit<Product, 'id' | 'status' | 'lastUpdated'> & { id?: string }) => {
    const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const status = deriveStatus(data.stock, data.lowStockThreshold);

    if (data.id) {
      const { error } = await supabase.from('products').update({
        name: data.name,
        sku: data.sku,
        category: data.category,
        warehouse: data.warehouse,
        vendor: data.vendor || null,
        image_url: data.imageUrl || null,
        stock: data.stock,
        low_stock_threshold: data.lowStockThreshold,
        price: data.price,
        product_type: data.productType,
        status,
        last_updated: now,
      }).eq('id', data.id);

      if (error) {
        console.error(error);
        showToast('Failed to update product.', 'error');
      } else {
        showToast('Product updated successfully.');
        await fetchProducts();
      }
    } else {
      const maxNum = products.length > 0 ? Math.max(...products.map(p => parseInt(p.id.replace('P', '')) || 0)) : 0;
      const newId = `P${String(maxNum + 1).padStart(3, '0')}`;

      const { error } = await supabase.from('products').insert({
        id: newId,
        name: data.name,
        sku: data.sku,
        category: data.category,
        warehouse: data.warehouse,
        vendor: data.vendor || null,
        image_url: data.imageUrl || null,
        stock: data.stock,
        low_stock_threshold: data.lowStockThreshold,
        price: data.price,
        product_type: data.productType,
        status,
        last_updated: now,
      });

      if (error) {
        console.error(error);
        showToast('Failed to add product.', 'error');
      } else {
        showToast('Product added successfully.');
        await fetchProducts();
      }
    }
    setEditProduct(null);
    setShowAddModal(false);
  };

  const handleAdjust = async (productId: string, delta: number, type: string, note: string) => {
    const target = products.find((p) => p.id === productId);
    if (!target) return;

    const newStock = Math.max(0, target.stock + delta);
    const now = new Date().toISOString().slice(0, 16).replace('T', ' ');

    const { error: updateError } = await supabase.from('products').update({
      stock: newStock,
      status: deriveStatus(newStock, target.lowStockThreshold),
      last_updated: now,
    }).eq('id', productId);

    if (updateError) {
      console.error(updateError);
      showToast('Failed to adjust stock.', 'error');
      setAdjustProduct(null);
      return;
    }

    const { error: historyError } = await supabase.from('stock_history').insert({
      id: `SH-${Date.now()}`,
      product_id: productId,
      type,
      quantity: delta,
      stock_before: target.stock,
      stock_after: newStock,
      reference: 'ADJ-MANUAL',
      note: note || 'Manual stock adjustment',
      warehouse: target.warehouse,
      user_name: 'Admin',
      created_at: now,
    });

    if (historyError) console.error(historyError);

    await fetchProducts();
    await fetchHistory();
    setAdjustProduct(null);

    // Real-time low-stock alert pipeline trigger
    if (newStock <= target.lowStockThreshold) {
      showToast(`Stock adjusted. Checking alert rules...`);
      try {
        const { data: evalData } = await api.functions.invoke('alert-rules-evaluator', { body: {} });
        if (evalData && evalData.total_created > 0) {
          showToast(`Low stock alert created! ${evalData.total_created} notification(s) generated.`);
        } else {
          showToast('Stock is low — no new alert rules matched (already notified within last hour).');
        }
      } catch (evalErr) {
        console.error('Alert evaluator call failed:', evalErr);
        showToast('Stock adjusted, but alert check failed.', 'error');
      }
    } else {
      showToast('Stock adjusted successfully.');
    }
  };

  const handleDelete = async () => {
    if (!deleteProduct) return;
    const { error } = await supabase.from('products').delete().eq('id', deleteProduct.id);
    if (error) {
      console.error(error);
      showToast('Failed to delete product.', 'error');
    } else {
      showToast('Product deleted.', 'error');
      await fetchProducts();
    }
    setDeleteProduct(null);
  };

  const statusCounts = useMemo(() => ({
    all: products.length,
    in_stock: products.filter((p) => p.status === 'in_stock').length,
    low_stock: products.filter((p) => p.status === 'low_stock').length,
    out_of_stock: products.filter((p) => p.status === 'out_of_stock').length,
  }), [products]);

  const totalValue = useMemo(() => products.reduce((s, p) => s + p.stock * p.price, 0), [products]);

  return (
    <DashboardLayout title="Inventory" subtitle="Manage products, adjust stock levels, and view history.">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-[100] flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium shadow-lg transition-all ${toast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
          <i className={`${toast.type === 'success' ? 'ri-check-line' : 'ri-close-line'} text-base`}></i>
          {toast.msg}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <div className="w-8 h-8 flex items-center justify-center mr-3">
            <i className="ri-loader-4-line animate-spin text-xl"></i>
          </div>
          <span className="text-sm">Loading products...</span>
        </div>
      )}

      {!loading && (
        <>
          {/* KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            {[
              { label: 'Total Products', value: products.length, icon: 'ri-box-3-line', color: 'text-gray-800', bg: 'bg-gray-100' },
              { label: 'In Stock', value: statusCounts.in_stock, icon: 'ri-checkbox-circle-line', color: 'text-emerald-700', bg: 'bg-emerald-50' },
              { label: 'Low Stock', value: statusCounts.low_stock, icon: 'ri-alert-line', color: 'text-amber-700', bg: 'bg-amber-50' },
              { label: 'Out of Stock', value: statusCounts.out_of_stock, icon: 'ri-close-circle-line', color: 'text-red-600', bg: 'bg-red-50' },
            ].map((kpi) => (
              <div key={kpi.label} className="bg-white rounded-xl px-5 py-4 flex items-center gap-4">
                <div className={`w-10 h-10 flex items-center justify-center rounded-lg ${kpi.bg}`}>
                  <i className={`${kpi.icon} ${kpi.color} text-lg`}></i>
                </div>
                <div>
                  <p className="text-xl font-bold text-gray-900 tracking-tight">{kpi.value}</p>
                  <p className="text-xs text-gray-400">{kpi.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Main panel */}
          <div className="bg-white rounded-2xl">
            {/* Toolbar */}
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 px-6 py-4 border-b border-gray-100">
              {/* Search */}
              <div className="relative">
                <div className="w-4 h-4 flex items-center justify-center absolute left-3 top-1/2 -translate-y-1/2">
                  <i className="ri-search-line text-gray-400 text-sm"></i>
                </div>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name or SKU..."
                  className="pl-9 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg w-48 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                {/* Warehouse filter */}
                <select
                  value={filterWarehouse}
                  onChange={(e) => setFilterWarehouse(e.target.value)}
                  className="py-2 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 cursor-pointer text-gray-600"
                >
                  <option value="all">All Warehouses</option>
                  {availableWarehouses.map((w) => <option key={w} value={w}>{w}</option>)}
                </select>

                {/* Category filter */}
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="py-2 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 cursor-pointer text-gray-600"
                >
                  <option value="all">All Categories</option>
                  {availableCategories.map((c) => <option key={c}>{c}</option>)}
                </select>

                {/* Status filter */}
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
                  className="py-2 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 cursor-pointer text-gray-600"
                >
                  <option value="all">All Status ({statusCounts.all})</option>
                  <option value="in_stock">In Stock ({statusCounts.in_stock})</option>
                  <option value="low_stock">Low Stock ({statusCounts.low_stock})</option>
                  <option value="out_of_stock">Out of Stock ({statusCounts.out_of_stock})</option>
                </select>

                {/* Total value badge */}
                {/* <div className="hidden lg:flex items-center gap-1.5 bg-emerald-50 text-emerald-700 text-xs font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap">
                  <i className="ri-money-dollar-circle-line"></i>
                  {formatAmount(totalValue)}
                </div> */}

                <button
                  onClick={() => navigate('/categories')}
                  className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer whitespace-nowrap"
                >
                  Manage Categories
                </button>

                <button
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-add-line"></i> Add Product
                </button>
              </div>
            </div>

            {/* Table */}
            <ProductTable
              products={filtered}
              onEdit={(p) => setEditProduct(p)}
              onDelete={(p) => setDeleteProduct(p)}
              onAdjust={(p) => setAdjustProduct(p)}
              onViewHistory={(p) => setHistoryProduct(p)}
            />

            {filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <div className="w-12 h-12 flex items-center justify-center mb-3">
                  <i className="ri-archive-stack-line text-4xl"></i>
                </div>
                <p className="text-sm font-medium">No products match your filters.</p>
                <button onClick={() => { setSearch(''); setFilterStatus('all'); setFilterWarehouse('all'); setFilterCategory('all'); }} className="mt-3 text-xs text-emerald-600 hover:underline cursor-pointer">
                  Clear filters
                </button>
              </div>
            )}

            {/* Footer */}
            <div className="px-6 py-3 border-t border-gray-50 flex items-center justify-between">
              <p className="text-xs text-gray-400">Showing {filtered.length} of {products.length} products</p>
              <p className="text-xs text-gray-400">Last sync: 19 May 2026, 11:30</p>
            </div>
          </div>
        </>
      )}

      {/* Modals */}
      {(showAddModal || editProduct) && (
        <ProductFormModal
          product={editProduct}
          nextNum={products.length > 0 ? Math.max(...products.map(p => parseInt(p.id.replace(/\D/g, '')) || 0)) + 1 : 1}
          onClose={() => { setShowAddModal(false); setEditProduct(null); }}
          onSave={handleSaveProduct}
        />
      )}
      {adjustProduct && (
        <StockAdjustModal
          product={adjustProduct}
          history={history}
          onClose={() => setAdjustProduct(null)}
          onAdjust={handleAdjust}
        />
      )}
      {historyProduct && (
        <StockHistoryModal
          product={historyProduct}
          history={history}
          onClose={() => setHistoryProduct(null)}
        />
      )}
      {deleteProduct && (
        <DeleteConfirmModal
          product={deleteProduct}
          onClose={() => setDeleteProduct(null)}
          onConfirm={handleDelete}
        />
      )}
    </DashboardLayout>
  );
}
