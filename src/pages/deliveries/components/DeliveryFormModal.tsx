import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { DeliveryRecord, DeliveryStep } from '@/mocks/deliveries';
import { getReservedQuantities, availableStock } from '@/lib/stockReservations';

interface DeliveryFormModalProps {
  delivery?: DeliveryRecord;
  onClose: () => void;
  onSave: (delivery: DeliveryRecord) => void;
}

interface ProductOption {
  id: string;
  name: string;
  sku: string;
  image_url?: string | null;
  stock: number;
  warehouse: string;
}

const stepOptions: DeliveryStep[] = ['prepare', 'ready', 'in_transit', 'delivered'];

const emptyForm = {
  fromWarehouse: '',
  toWarehouse: '',
  items: [] as { productId?: string; productName: string; sku: string; imageUrl?: string | null; quantity: number }[],
  status: 'prepare' as DeliveryStep,
  estimatedDelivery: '',
  timeline: [] as { step: DeliveryStep; timestamp: string; note: string; completedBy?: string }[],
  last_update: '',
  created_at: '',
  transferId: '',
  driver_name: '',
  vehicle_plate: '',
  departure_time: '',
  arrival_time: '',
  imageUrl: '',
  notes: '',
};

const formatStep = (step: DeliveryStep) => step.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const inputClass = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300';

export default function DeliveryFormModal({ delivery, onClose, onSave }: DeliveryFormModalProps) {
  const [form, setForm] = useState(emptyForm);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedQty, setSelectedQty] = useState(1);
  const [imageMode, setImageMode] = useState<'file' | 'url'>('file');
  const [error, setError] = useState('');
  const [reserved, setReserved] = useState<Record<string, number>>({});

  const autoTransferId = useMemo(
    () => `TRF-${String(Math.floor(Date.now() / 1000) % 100000).padStart(5, '0')}`,
    []
  );

  useEffect(() => {
    const fetchProducts = async () => {
      const { data, error } = await supabase.from('products').select('id, name, sku, image_url, stock, warehouse');
      if (!error) setProducts((data || []) as ProductOption[]);
    };
    const fetchWarehouses = async () => {
      const { data, error } = await supabase.from('warehouses').select('name').order('name', { ascending: true });
      if (!error && data) setWarehouses(data.map((w) => w.name as string));
    };

    fetchProducts();
    fetchWarehouses();
    getReservedQuantities(delivery ? { excludeDeliveryId: delivery.id } : {}).then(setReserved);
  }, [delivery]);

  useEffect(() => {
    if (!delivery) {
      setForm({
        ...emptyForm,
        transferId: autoTransferId,
      });
      return;
    }

    setForm({
      fromWarehouse: delivery.fromWarehouse,
      toWarehouse: delivery.toWarehouse,
      items: delivery.items,
      status: delivery.status,
      estimatedDelivery: delivery.estimatedDelivery,
      timeline: delivery.timeline,
      last_update: delivery.last_update,
      created_at: delivery.created_at,
      transferId: delivery.transferId || autoTransferId,
      driver_name: delivery.driver_name || '',
      vehicle_plate: delivery.vehicle_plate || '',
      departure_time: delivery.departure_time || '',
      arrival_time: delivery.arrival_time || '',
      imageUrl: delivery.imageUrl || '',
      notes: delivery.notes || '',
    });
  }, [delivery, autoTransferId]);

  useEffect(() => {
    if (!delivery && !form.fromWarehouse && warehouses.length > 0) {
      setForm((prev) => ({ ...prev, fromWarehouse: warehouses[0] }));
    }
  }, [warehouses, delivery, form.fromWarehouse]);

  const availableProducts = products.filter(
    (p) => p.warehouse === form.fromWarehouse && p.stock > 0 && !form.items.some((item) => item.sku === p.sku)
  );

  const destinationWarehouses = warehouses.filter((w) => w !== form.fromWarehouse);

  const addItem = () => {
    const product = products.find((p) => p.id === selectedProductId);
    if (!product || selectedQty < 1) return;
    const available = availableStock(product.stock, reserved, product.id);
    if (selectedQty > available) {
      setError(`Only ${available} unit${available === 1 ? '' : 's'} of "${product.name}" available — the rest is tied up in other pending requests/orders/transfers/deliveries.`);
      return;
    }
    setError('');

    setForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        { productId: product.id, productName: product.name, sku: product.sku, imageUrl: product.image_url || null, quantity: selectedQty },
      ],
    }));
    setSelectedProductId('');
    setSelectedQty(1);
  };

  const handleFilePick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setForm((prev) => ({ ...prev, imageUrl: String(reader.result || '') }));
    };
    reader.readAsDataURL(file);
  };

  const removeItem = (sku: string) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.sku !== sku),
    }));
  };

  const handleSubmit = () => {
    if (!form.fromWarehouse.trim() || !form.toWarehouse.trim()) {
      setError('Please select the from and to warehouse.');
      return;
    }

    if (form.fromWarehouse === form.toWarehouse) {
      setError('From and to warehouse must be different.');
      return;
    }

    if (!form.estimatedDelivery.trim()) {
      setError('Please set an estimated delivery date.');
      return;
    }

    if (form.items.length === 0) {
      setError('Please add at least one delivery item.');
      return;
    }

    setError('');

    const now = new Date().toLocaleString('sv').replace('T', ' ').slice(0, 16);
    const items = form.items.map((item) => ({
      productName: item.productName,
      sku: item.sku,
      imageUrl: item.imageUrl || null,
      quantity: item.quantity,
    }));

    const timeline = delivery?.timeline?.length
      ? delivery.timeline.map((event) => ({ ...event }))
      : [{ step: form.status, timestamp: now, note: 'Delivery record created.', completedBy: 'Admin' }];

    const record: DeliveryRecord = {
      id: delivery?.id || `DEL-${Date.now()}`,
      transferId: form.transferId.trim(),
      fromWarehouse: form.fromWarehouse.trim(),
      toWarehouse: form.toWarehouse.trim(),
      items,
      items_detail: items.map((item) => `${item.productName}|${item.sku}|${item.quantity}`).join('\n'),
      status: form.status,
      estimatedDelivery: form.estimatedDelivery.trim(),
      timeline,
      last_update: now,
      created_at: delivery?.created_at || now,
      driver_name: form.driver_name.trim(),
      vehicle_plate: form.vehicle_plate.trim(),
      departure_time: form.departure_time.trim(),
      arrival_time: form.arrival_time.trim(),
      imageUrl: form.imageUrl.trim() || undefined,
      notes: form.notes.trim(),
    };

    onSave(record);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-3xl mx-4 shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900">{delivery ? 'Edit Delivery' : 'Create Delivery'}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{delivery ? 'Update shipment details' : 'Move stock from one warehouse to another'}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 cursor-pointer">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <section className="space-y-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Route</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">From Warehouse</label>
                <select
                  value={form.fromWarehouse}
                  onChange={(e) => setForm((prev) => ({ ...prev, fromWarehouse: e.target.value, items: [] }))}
                  className={inputClass}
                >
                  <option value="">Select warehouse</option>
                  {warehouses.map((w) => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">To Warehouse</label>
                <select
                  value={form.toWarehouse}
                  onChange={(e) => setForm((prev) => ({ ...prev, toWarehouse: e.target.value }))}
                  className={inputClass}
                >
                  <option value="">Select warehouse</option>
                  {destinationWarehouses.map((w) => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Status</label>
                <select value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as DeliveryStep }))} className={inputClass}>
                  {stepOptions.map((step) => <option key={step} value={step}>{formatStep(step)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Estimated delivery</label>
                <input type="date" value={form.estimatedDelivery} onChange={(e) => setForm((prev) => ({ ...prev, estimatedDelivery: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Transfer ID</label>
                <input value={form.transferId} onChange={(e) => setForm((prev) => ({ ...prev, transferId: e.target.value }))} placeholder="TRF-00001" className={inputClass} />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Delivery image</p>
            <div className="flex items-center gap-2 mb-2">
              <button
                type="button"
                onClick={() => setImageMode('file')}
                className={`px-3 py-1.5 text-xs rounded-full border ${imageMode === 'file' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
              >
                Choose File
              </button>
              <button
                type="button"
                onClick={() => setImageMode('url')}
                className={`px-3 py-1.5 text-xs rounded-full border ${imageMode === 'url' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
              >
                Use URL
              </button>
            </div>
            {imageMode === 'file' ? (
              <input
                type="file"
                accept="image/*"
                onChange={handleFilePick}
                className="w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
              />
            ) : (
              <input
                value={form.imageUrl}
                onChange={(e) => setForm((prev) => ({ ...prev, imageUrl: e.target.value }))}
                placeholder="https://example.com/image.jpg"
                className={inputClass}
              />
            )}
            {form.imageUrl && (
              <div className="mt-3 flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
                <img src={form.imageUrl} alt="Delivery preview" className="w-12 h-12 rounded-md object-cover border border-gray-200" />
                <span className="text-xs text-gray-500">Preview</span>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Logistics</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Driver name</label>
                <input value={form.driver_name} onChange={(e) => setForm((prev) => ({ ...prev, driver_name: e.target.value }))} placeholder="John Doe" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Vehicle plate</label>
                <input value={form.vehicle_plate} onChange={(e) => setForm((prev) => ({ ...prev, vehicle_plate: e.target.value }))} placeholder="BMA 4521" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Departure time</label>
                <input type="datetime-local" value={form.departure_time} onChange={(e) => setForm((prev) => ({ ...prev, departure_time: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Arrival time</label>
                <input type="datetime-local" value={form.arrival_time} onChange={(e) => setForm((prev) => ({ ...prev, arrival_time: e.target.value }))} className={inputClass} />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Notes (optional)</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Any additional remarks about this shipment..."
                  rows={2}
                  className={inputClass}
                />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Items (picked from {form.fromWarehouse || 'the from-warehouse'})</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                disabled={!form.fromWarehouse}
                className={`${inputClass} sm:flex-1`}
              >
                <option value="">Select inventory item</option>
                {availableProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku}) — {availableStock(p.stock, reserved, p.id)} available
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                value={selectedQty === 0 ? '' : selectedQty}
                onChange={(e) => {
                  // Don't force a fallback to 1 while typing — that snaps the value
                  // back on every keystroke (e.g. while backspacing to clear it)
                  // and fights the user's typing.
                  const val = e.target.value;
                  setSelectedQty(val === '' ? 0 : Math.max(0, Number(val) || 0));
                }}
                placeholder="1"
                className="w-full sm:w-24 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
              <button
                type="button"
                onClick={addItem}
                disabled={!selectedProductId}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                Add item
              </button>
            </div>

            {form.items.length > 0 ? (
              <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Item</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">SKU</th>
                      <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Qty</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {form.items.map((item) => (
                      <tr key={`${item.sku}-${item.productName}`}>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0 overflow-hidden">
                              {item.imageUrl ? (
                                <img src={item.imageUrl} alt={item.productName} className="w-full h-full object-cover" />
                              ) : (
                                <i className="ri-box-3-line text-emerald-500 text-xs"></i>
                              )}
                            </div>
                            <span className="text-gray-700">{item.productName}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-gray-500 font-mono text-xs">{item.sku}</td>
                        <td className="px-3 py-2 text-center text-gray-700">{item.quantity}</td>
                        <td className="px-3 py-2 text-right">
                          <button type="button" onClick={() => removeItem(item.sku)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors cursor-pointer ml-auto">
                            <i className="ri-delete-bin-line text-sm"></i>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-dashed border-gray-200 py-6 text-center text-sm text-gray-400">
                No items selected yet.
              </div>
            )}
          </section>

          {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-3">{error}</div>}
        </form>

        <div className="px-6 py-4 border-t border-gray-100 shrink-0 flex items-center justify-between">
          <p className="text-xs text-gray-400">{delivery ? 'Save changes to this shipment' : 'Create shipment record'}</p>
          <div className="flex items-center gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">Cancel</button>
            <button type="submit" onClick={handleSubmit} className="px-4 py-2 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 cursor-pointer">{delivery ? 'Save Changes' : 'Create Delivery'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
