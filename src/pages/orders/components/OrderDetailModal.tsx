import { useState, useEffect } from 'react';
import { Order, VendorSplit, OrderItem } from '@/mocks/orders';
import OrderStatusBadge from './OrderStatusBadge';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useAuth } from '@/contexts/AuthContext';
import { deductStockForItems } from '@/lib/stockDeduction';
import { uploadShipmentDocument } from '@/lib/uploadShipmentDocument';
import { downloadPdf, type PdfTableSpec } from '@/lib/exportPdf';
import { supabase } from '@/lib/supabase';
import { asArray } from '@/pages/warehouses/warehouseShared';
import { binStockKey } from '@/lib/binStock';

interface OrderDetailModalProps {
  order: Order;
  onClose: () => void;
  onUpdateOrder: (updated: Order) => void;
}

const vendorStatusColors: Record<string, string> = {
  pending: 'border-amber-200 bg-amber-50/40',
  accepted: 'border-emerald-200 bg-emerald-50/30',
  rejected: 'border-red-200 bg-red-50/30',
  partial: 'border-sky-200 bg-sky-50/30',
};

export default function OrderDetailModal({ order, onClose, onUpdateOrder }: OrderDetailModalProps) {
  const { formatAmount } = useCurrency();
  const { canApprove, canShip, profile } = useAuth();
  const canDecide = canApprove('orders');
  const canConfirmShipment = canShip('orders');
  const [splits, setSplits] = useState<VendorSplit[]>(order.vendorSplits);
  const [partialQty, setPartialQty] = useState<Record<string, number>>({});
  const [confirmMsg, setConfirmMsg] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [receiptName, setReceiptName] = useState('');
  const [receiptChecked, setReceiptChecked] = useState(false);
  const [shipmentDocFile, setShipmentDocFile] = useState<File | null>(null);
  const [shipmentNote, setShipmentNote] = useState('');
  const [shipping, setShipping] = useState(false);
  const [binByItem, setBinByItem] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      order.vendorSplits.flatMap((s) => s.items).filter((i) => i.binLocation).map((i) => [i.id, i.binLocation as string])
    )
  );
  const [binOptionsByWarehouse, setBinOptionsByWarehouse] = useState<Record<string, string[]>>({});
  const isPending = order.status === 'pending';
  const isShippable = order.status === 'accepted' || order.status === 'partial';

  // Bin options come from each split's own warehouse registry PLUS any bin
  // its products already use — the registry alone can be empty even when
  // real bins are already in use. Picked when confirming shipment, since
  // that's the one action that actually deducts stock.
  useEffect(() => {
    if (!isShippable || order.shippedAt) return;
    (async () => {
      const warehouseNames = [...new Set(splits.map((s) => s.warehouse))];
      if (warehouseNames.length === 0) return;
      const allProductIds = splits.flatMap((s) => s.items.map((i) => i.productId));
      const [{ data: whData }, { data: binRows }] = await Promise.all([
        supabase.from('warehouses').select('name, bin_locations').in('name', warehouseNames),
        allProductIds.length > 0
          ? supabase.from('product_bin_stock').select('product_id, warehouse, bin_location').in('warehouse', warehouseNames).in('product_id', allProductIds)
          : Promise.resolve({ data: [] as { product_id: string; warehouse: string; bin_location: string }[] }),
      ]);
      const productBinsByKey: Record<string, string[]> = {};
      (binRows || []).forEach((row) => {
        const key = binStockKey(row.product_id as string, row.warehouse as string);
        (productBinsByKey[key] ??= []).push(row.bin_location as string);
      });
      const map: Record<string, string[]> = {};
      (whData || []).forEach((w) => { map[w.name as string] = asArray<string>(w.bin_locations); });
      splits.forEach((s) => {
        const registryBins = map[s.warehouse] || [];
        const productBins = s.items.flatMap((i) => productBinsByKey[binStockKey(i.productId, s.warehouse)] || []);
        map[s.warehouse] = [...new Set([...registryBins, ...productBins])];
      });
      setBinOptionsByWarehouse(map);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isShippable, order.shippedAt]);

  const updateItemStatus = (splitIdx: number, itemId: string, status: OrderItem['status']) => {
    setSplits((prev) =>
      prev.map((s, si) => {
        if (si !== splitIdx) return s;
        const updatedItems = s.items.map((item) => (item.id === itemId ? { ...item, status } : item));
        const allAccepted = updatedItems.every((i) => i.status === 'accepted');
        const allRejected = updatedItems.every((i) => i.status === 'rejected');
        const someAccepted = updatedItems.some((i) => i.status === 'accepted');
        const vendorStatus = allAccepted ? 'accepted' : allRejected ? 'rejected' : someAccepted ? 'partial' : 'pending';
        return { ...s, items: updatedItems, status: vendorStatus as VendorSplit['status'] };
      })
    );
  };

  const handlePartialQty = (itemId: string, val: number, max: number) => {
    setPartialQty((prev) => ({ ...prev, [itemId]: Math.min(Math.max(0, val), max) }));
  };

  const computeNewStatus = (s: VendorSplit[]): Order['status'] => {
    const allAccepted = s.every((v) => v.status === 'accepted');
    const allRejected = s.every((v) => v.status === 'rejected');
    // A split that's itself 'partial' (mixed accept/reject within one vendor) must
    // also count here — otherwise an order with one partially-decided vendor split
    // silently falls through to 'pending' even though real decisions were made.
    const anyDecided = s.some((v) => v.status === 'accepted' || v.status === 'partial');
    if (allAccepted) return 'accepted';
    if (allRejected) return 'rejected';
    if (anyDecided) return 'partial';
    return 'pending';
  };

  const handleConfirm = async () => {
    if (!canDecide) return;

    // Confirming the order is a decision on every item — anything the reviewer
    // never individually touched (still 'pending') is treated as accepted, so
    // clicking Confirm without picking through each item still works as a
    // straightforward "approve this order" action.
    const resolvedSplits = splits.map((s) => ({
      ...s,
      items: s.items.map((i) => (i.status === 'pending' ? { ...i, status: 'accepted' as const } : i)),
    }));
    resolvedSplits.forEach((s) => {
      const allAccepted = s.items.every((i) => i.status === 'accepted');
      const allRejected = s.items.every((i) => i.status === 'rejected');
      const someAccepted = s.items.some((i) => i.status === 'accepted');
      s.status = allAccepted ? 'accepted' : allRejected ? 'rejected' : someAccepted ? 'partial' : 'pending';
    });

    const newStatus = computeNewStatus(resolvedSplits);

    // Accepting no longer touches stock — that only happens once the order is
    // actually shipped (Confirm Shipment), backed by a required document.
    const updated: Order = { ...order, vendorSplits: resolvedSplits, status: newStatus, updatedAt: new Date().toLocaleString('sv').replace('T', ' ').slice(0, 16) };
    onUpdateOrder(updated);
    onClose();
  };

  const handleDownloadPdf = async () => {
    const allProductIds = splits.flatMap((split) => split.items.map((i) => i.productId));
    const { data: binRows } = await supabase
      .from('product_warehouse_stock')
      .select('product_id, warehouse, bin_location')
      .in('product_id', allProductIds);
    const binByKey = new Map((binRows || []).map((r) => [binStockKey(r.product_id as string, r.warehouse as string), r.bin_location as string | null]));

    const totalItems = splits.reduce((s, split) => s + split.items.reduce((si, i) => si + i.quantity, 0), 0);
    const tables: PdfTableSpec[] = splits.map((split) => ({
      title: `${split.vendor} · ${split.warehouse}`,
      head: ['Product', 'SKU', 'Bin', 'Qty', 'Unit Price', 'Total', 'Status'],
      rows: split.items.map((item) => [
        item.productName,
        item.sku,
        item.binLocation || binByKey.get(binStockKey(item.productId, split.warehouse)) || '—',
        item.quantity,
        formatAmount(item.unitPrice),
        formatAmount(item.unitPrice * item.quantity),
        item.status.replace(/^\w/, (c) => c.toUpperCase()),
      ]),
      colStyles: { 3: { halign: 'center' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
      footRow: [{ content: 'Split Subtotal', colSpan: 5, styles: { halign: 'right' } }, formatAmount(split.subtotal), ''],
    }));

    downloadPdf(
      {
        docType: 'Purchase Order',
        docId: order.id,
        status: order.status,
        subtitle: order.city ? `${order.customer} · ${order.city}` : order.customer,
        infoBoxes: [
          {
            title: 'Customer',
            rows: [
              ...(order.email ? [{ label: 'Email', value: order.email }] : []),
              ...(order.phone ? [{ label: 'Phone', value: order.phone }] : []),
              ...(order.address || order.city ? [{ label: 'Address', value: [order.address, order.city].filter(Boolean).join(', ') }] : []),
              { label: 'Ordered', value: order.createdAt },
            ],
          },
          {
            title: 'Summary',
            rows: [
              { label: 'Vendor Splits', value: String(splits.length) },
              { label: 'Total Items', value: String(totalItems) },
              { label: 'Order Total', value: formatAmount(order.total) },
            ],
          },
        ],
        notes: order.notes ? [{ label: 'Notes', text: order.notes, tone: 'amber' }] : undefined,
        tables,
        footerLeft: `Requested by ${order.customer}`,
      },
      `${order.id}.pdf`
    );
  };

  const handleReject = () => {
    if (!canDecide) return;
    const rejectedSplits = splits.map((s) => ({ ...s, status: 'rejected' as const, items: s.items.map((i) => ({ ...i, status: 'rejected' as const })) }));
    const updated: Order = { ...order, vendorSplits: rejectedSplits, status: 'rejected', updatedAt: new Date().toLocaleString('sv').replace('T', ' ').slice(0, 16) };
    onUpdateOrder(updated);
    onClose();
  };

  // Receipt Confirmation is the one place stock actually leaves the warehouse —
  // requires a delivery document, mirroring Purchases/Transfers/Returns/Requests.
  // (An order already shipped under the old two-step flow skips re-upload and
  // re-deduction — shipmentDocFile is irrelevant for that legacy path.)
  const handleConfirmReceipt = async () => {
    if (!receiptName.trim() || !receiptChecked) return;
    const alreadyShipped = !!order.shippedAt;
    if (!alreadyShipped && (!canConfirmShipment || !shipmentDocFile)) return;

    setShipping(true);
    const now = new Date().toISOString();
    const updated: Order = {
      ...order,
      status: 'fulfilled',
      receivedAt: now,
      receivedBy: receiptName.trim(),
      receiptConfirmed: true,
      updatedAt: new Date().toLocaleString('sv').replace('T', ' ').slice(0, 16),
    };

    if (!alreadyShipped) {
      const { url: documentUrl, error: uploadError } = await uploadShipmentDocument(shipmentDocFile as File);
      if (uploadError || !documentUrl) {
        setShipping(false);
        setConfirmMsg('Cannot confirm receipt: ' + (uploadError || 'upload failed'));
        return;
      }

      const acceptedItems: { productId: string; warehouse: string; quantity: number; binLocation?: string }[] = [];
      splits.forEach((split) => {
        split.items.forEach((item) => {
          if (item.status === 'accepted') acceptedItems.push({ productId: item.productId, warehouse: item.warehouse || split.warehouse, quantity: item.quantity, binLocation: binByItem[item.id] });
        });
      });

      if (acceptedItems.length > 0) {
        const { error } = await deductStockForItems(acceptedItems, {
          reference: order.id,
          note: `Order ${order.id} shipped`,
          userName: profile?.full_name || profile?.email || 'Admin',
          historyType: 'sale',
        });
        if (error) {
          setShipping(false);
          setConfirmMsg('Cannot confirm receipt: ' + error);
          return;
        }
      }

      // Persist whichever bin was actually picked for each accepted item — otherwise
      // it's used for the stock deduction above but then forgotten, and the order
      // would show no bin at all once it's fulfilled.
      updated.vendorSplits = splits.map((split) => ({
        ...split,
        items: split.items.map((item) => (
          item.status === 'accepted' && binByItem[item.id] ? { ...item, binLocation: binByItem[item.id] } : item
        )),
      }));

      updated.shippedAt = now;
      updated.shippedBy = profile?.full_name || profile?.email || 'Admin';
      updated.shipmentNote = shipmentNote.trim() || null;
      updated.shipmentDocumentUrl = documentUrl;
      updated.shipmentDocumentName = (shipmentDocFile as File).name;
    }

    setShipping(false);
    onUpdateOrder(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-2xl mx-4 shadow-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100 shrink-0">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-base font-bold text-gray-900">{order.id}</h2>
              <OrderStatusBadge status={order.status} />
              {order.orderType === 'quick' && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                  <i className="ri-flashlight-line"></i>Quick
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">{order.customer}{order.city ? ` · ${order.city}` : ''} · {order.createdAt}</p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button onClick={handleDownloadPdf} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer whitespace-nowrap">
              <i className="ri-file-pdf-2-line"></i>Download PDF
            </button>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 cursor-pointer">
              <i className="ri-close-line text-lg"></i>
            </button>
          </div>
        </div>

        {/* Customer info */}
        <div className="px-6 py-3 bg-gray-50/60 border-b border-gray-100 shrink-0">
          <div className="flex flex-wrap gap-6 text-sm">
            <div className="flex items-center gap-2 text-gray-500">
              <i className="ri-user-line text-gray-400"></i>
              <span>Requested by {order.customer}</span>
            </div>
            {order.email && (
              <div className="flex items-center gap-2 text-gray-500">
                <i className="ri-mail-line text-gray-400"></i>
                <span>{order.email}</span>
              </div>
            )}
            {order.phone && (
              <div className="flex items-center gap-2 text-gray-500">
                <i className="ri-phone-line text-gray-400"></i>
                <span>{order.phone}</span>
              </div>
            )}
            {(order.address || order.city) && (
              <div className="flex items-center gap-2 text-gray-500">
                <i className="ri-map-pin-line text-gray-400"></i>
                <span>{[order.address, order.city].filter(Boolean).join(', ')}</span>
              </div>
            )}
          </div>
          {order.notes && (
            <div className="mt-2 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
              <i className="ri-information-line mt-0.5"></i>
              <span>{order.notes}</span>
            </div>
          )}
        </div>

        {/* Vendor splits */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Vendor Splits ({splits.length})</p>
          {splits.map((split, si) => (
            <div key={si} className={`rounded-xl border p-4 ${vendorStatusColors[split.status] ?? 'border-gray-200'}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 flex items-center justify-center rounded-md bg-white border border-gray-200">
                    <i className="ri-store-2-line text-gray-500 text-sm"></i>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{split.vendor}</p>
                    <p className="text-xs text-gray-400">{split.warehouse}</p>
                  </div>
                </div>
              </div>

              {/* Items */}
              <div className="space-y-2">
                {split.items.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2.5 border border-gray-100">
                    <div className="w-7 h-7 flex items-center justify-center rounded-md bg-gray-50 overflow-hidden">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.productName} className="w-full h-full object-cover" />
                      ) : (
                        <i className="ri-box-3-line text-gray-400 text-sm"></i>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 leading-tight truncate">{item.productName}</p>
                      <p className="text-xs text-gray-400">
                        {item.sku} · Available: {item.availableQty}
                        {item.binLocation ? ` · Bin: ${item.binLocation}` : ''}
                      </p>
                    </div>

                    {/* Partial qty input */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-400">Qty:</span>
                      <input
                        type="number"
                        min={0}
                        max={item.quantity}
                        value={partialQty[item.id] ?? item.quantity}
                        onChange={(e) => handlePartialQty(item.id, parseInt(e.target.value) || 0, item.quantity)}
                        className="w-14 text-center text-xs border border-gray-200 rounded-md py-1 focus:outline-none focus:ring-1 focus:ring-emerald-300"
                      />
                      <span className="text-xs text-gray-400">/ {item.quantity}</span>
                    </div>

                    <span className="text-sm font-semibold text-gray-700 whitespace-nowrap">{formatAmount(item.unitPrice * item.quantity)}</span>

                    {/* Item-level accept/reject */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => updateItemStatus(si, item.id, 'accepted')}
                        className={`w-7 h-7 flex items-center justify-center rounded-md cursor-pointer transition-colors ${item.status === 'accepted' ? 'bg-emerald-100 text-emerald-700' : 'hover:bg-emerald-50 text-gray-400'}`}
                        title="Accept"
                      >
                        <i className="ri-check-line text-sm"></i>
                      </button>
                      <button
                        onClick={() => updateItemStatus(si, item.id, 'rejected')}
                        className={`w-7 h-7 flex items-center justify-center rounded-md cursor-pointer transition-colors ${item.status === 'rejected' ? 'bg-red-100 text-red-600' : 'hover:bg-red-50 text-gray-400'}`}
                        title="Reject"
                      >
                        <i className="ri-close-line text-sm"></i>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Subtotal */}
              <div className="flex items-center justify-end mt-3 pt-2 border-t border-dashed border-gray-200">
                <span className="text-xs text-gray-400 mr-2">Split Subtotal:</span>
                <span className="text-sm font-bold text-gray-800">{formatAmount(split.subtotal)}</span>
              </div>
            </div>
          ))}

          {/* Receipt Confirmation — the one place stock actually leaves the warehouse,
              gated on a delivery document. An order already shipped under the old
              two-step flow (shippedAt set, receipt not yet confirmed) just needs the
              sign-off — its stock was already deducted, so no document/re-deduction
              is asked for. */}
          {(isShippable || order.status === 'processing' || order.status === 'fulfilled') && (
            <div className="rounded-xl border border-gray-100 p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Receipt Confirmation</p>

              {order.receiptConfirmed ? (
                <div className="flex items-start gap-2.5 text-sm text-gray-700">
                  <i className="ri-file-shield-2-line text-emerald-500 mt-0.5"></i>
                  <div>
                    <p>Received by <span className="font-medium">{order.receivedBy}</span> on {order.receivedAt ? new Date(order.receivedAt).toLocaleString() : ''}</p>
                    {order.shipmentNote && <p className="text-xs text-gray-400 mt-0.5">{order.shipmentNote}</p>}
                    {order.shipmentDocumentUrl && (
                      <a href={order.shipmentDocumentUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-sky-600 hover:underline mt-0.5 inline-flex items-center gap-1">
                        <i className="ri-file-text-line"></i>{order.shipmentDocumentName || 'View document'}
                      </a>
                    )}
                  </div>
                </div>
              ) : order.shippedAt ? (
                canConfirmShipment ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={receiptName}
                      onChange={(e) => setReceiptName(e.target.value)}
                      placeholder="Receiver's full name"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    />
                    <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={receiptChecked} onChange={(e) => setReceiptChecked(e.target.checked)} className="rounded" />
                      I confirm this order was received in good condition.
                    </label>
                    <button
                      onClick={handleConfirmReceipt}
                      disabled={!receiptName.trim() || !receiptChecked}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    >
                      <i className="ri-quill-pen-line"></i>Confirm Receipt
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">Awaiting receipt confirmation.</p>
                )
              ) : canConfirmShipment ? (
                <div className="space-y-2">
                  {splits.some((s) => (binOptionsByWarehouse[s.warehouse] || []).length > 0) && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-3">
                      {splits.map((split, si) => {
                        const binOptions = binOptionsByWarehouse[split.warehouse] || [];
                        const acceptedInSplit = split.items.filter((i) => i.status === 'accepted');
                        if (binOptions.length === 0 || acceptedInSplit.length === 0) return null;
                        return (
                          <div key={si} className="space-y-1.5">
                            <p className="text-xs font-semibold text-gray-600">Ship from bin — {split.warehouse}</p>
                            {acceptedInSplit.map((item) => (
                              <div key={item.id} className="flex items-center justify-between gap-3">
                                <span className="text-xs text-gray-600 truncate">{item.productName} <span className="text-gray-400">×{item.quantity}</span></span>
                                <select
                                  value={binByItem[item.id] ?? ''}
                                  onChange={(e) => setBinByItem((prev) => ({ ...prev, [item.id]: e.target.value }))}
                                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-200 cursor-pointer shrink-0"
                                >
                                  <option value="">Unassigned</option>
                                  {binOptions.map((b) => <option key={b} value={b}>{b}</option>)}
                                </select>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {shipmentDocFile ? (
                    <div className="flex items-center gap-2.5 border border-gray-200 rounded-lg p-2.5">
                      <div className="w-8 h-8 rounded-lg bg-sky-50 flex items-center justify-center shrink-0">
                        <i className="ri-file-text-line text-sky-500"></i>
                      </div>
                      <span className="text-xs font-medium text-gray-700 truncate flex-1">{shipmentDocFile.name}</span>
                      <button
                        type="button"
                        onClick={() => setShipmentDocFile(null)}
                        className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 cursor-pointer shrink-0"
                      >
                        <i className="ri-close-line text-sm"></i>
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center gap-1 py-3 border-2 border-dashed border-gray-200 rounded-lg cursor-pointer hover:border-sky-300 transition-colors">
                      <i className="ri-upload-cloud-2-line text-lg text-gray-300"></i>
                      <span className="text-xs font-medium text-gray-600">Click to attach pickslip / delivery document</span>
                      <span className="text-[10px] text-gray-400">Required to confirm receipt</span>
                      <input
                        type="file"
                        className="hidden"
                        onChange={(e) => { setShipmentDocFile(e.target.files?.[0] || null); e.target.value = ''; }}
                      />
                    </label>
                  )}
                  <input
                    type="text"
                    value={shipmentNote}
                    onChange={(e) => setShipmentNote(e.target.value)}
                    placeholder="Shipment note (optional)"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-200"
                  />
                  <input
                    type="text"
                    value={receiptName}
                    onChange={(e) => setReceiptName(e.target.value)}
                    placeholder="Receiver's full name"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                  <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={receiptChecked} onChange={(e) => setReceiptChecked(e.target.checked)} className="rounded" />
                    I confirm this order was received in good condition.
                  </label>
                  <button
                    onClick={handleConfirmReceipt}
                    disabled={!shipmentDocFile || !receiptName.trim() || !receiptChecked || shipping}
                    title={shipmentDocFile ? undefined : 'Attach the delivery document above to enable'}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  >
                    <i className={shipping ? 'ri-loader-4-line animate-spin' : 'ri-quill-pen-line'}></i>{shipping ? 'Confirming…' : 'Confirm Receipt'}
                  </button>
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">Not shipped yet.</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0">
          {confirmMsg && (
            <div className={`mb-3 text-xs font-medium px-3 py-2 rounded-lg flex items-center gap-2 ${confirmMsg.startsWith('Cannot confirm') ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
              <i className={confirmMsg.startsWith('Cannot confirm') ? 'ri-error-warning-line' : 'ri-check-double-line'}></i> {confirmMsg}
            </div>
          )}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400">Order Total</p>
              <p className="text-lg font-bold text-gray-900">{formatAmount(order.total)}</p>
            </div>
            {isPending && (
              <div className="flex items-center gap-3">
                <button
                  onClick={handleReject}
                  disabled={confirming || !canDecide}
                  title={canDecide ? undefined : "You don't have permission to approve or reject orders"}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                    canDecide
                      ? 'text-red-600 bg-white border border-red-200 hover:bg-red-50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'
                      : 'text-gray-400 bg-gray-100 border border-gray-200 cursor-not-allowed'
                  }`}
                >
                  Reject
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={confirming || !canDecide}
                  title={canDecide ? undefined : "You don't have permission to approve or reject orders"}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                    canDecide
                      ? 'text-white bg-emerald-500 hover:bg-emerald-600 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'
                      : 'text-gray-400 bg-gray-200 cursor-not-allowed'
                  }`}
                >
                  {confirming ? 'Confirming...' : 'Confirm Decisions'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
