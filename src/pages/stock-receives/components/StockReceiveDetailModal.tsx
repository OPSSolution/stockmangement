import type { StockReceive } from '@/mocks/stockReceives';
import { expiryTone, formatExpiry } from '@/lib/expiry';
import { downloadPdf } from '@/lib/exportPdf';

interface Props {
  receive: StockReceive;
  onClose: () => void;
}

export default function StockReceiveDetailModal({ receive, onClose }: Props) {
  const handleDownloadPdf = () => {
    downloadPdf(
      {
        docType: 'Stock Receive',
        docId: receive.id,
        status: 'received',
        subtitle: receive.warehouse + (receive.vendor ? ` · from ${receive.vendor}` : ''),
        infoBoxes: [
          {
            title: 'Receive Info',
            rows: [
              { label: 'Warehouse', value: receive.warehouse },
              { label: 'Vendor / Supplier', value: receive.vendor || '—' },
              { label: 'Reference', value: receive.reference || '—' },
              { label: 'Received By', value: receive.receivedBy },
              { label: 'Date', value: receive.createdAt },
            ],
          },
        ],
        notes: receive.notes ? [{ label: 'Notes', text: receive.notes, tone: 'gray' }] : undefined,
        tables: [
          {
            title: `Products Received (${receive.totalItems} units)`,
            head: ['Product', 'SKU', 'Bin', 'Expiry', 'Qty'],
            rows: receive.items.map((item) => [
              item.productName,
              item.sku,
              item.binLocation || '—',
              item.expiryDate ? formatExpiry(item.expiryDate) : '—',
              item.quantity,
            ]),
            colStyles: { 4: { halign: 'center' } },
            footRow: [{ content: 'Total Units', colSpan: 4, styles: { halign: 'right' } }, receive.totalItems],
          },
        ],
        footerLeft: receive.warehouse,
      },
      `${receive.id}.pdf`
    );
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-lg" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-lg font-bold text-gray-900">{receive.id}</h2>
              <span className="text-xs font-medium px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">
                <i className="ri-checkbox-circle-line mr-1"></i>Received
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {receive.warehouse}
              {receive.vendor && (
                <>
                  <span className="mx-2 text-gray-300">·</span>
                  {receive.vendor}
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={handleDownloadPdf} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer whitespace-nowrap">
              <i className="ri-file-pdf-2-line"></i>Download PDF
            </button>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 cursor-pointer">
              <i className="ri-close-line text-gray-500"></i>
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Info Grid */}
          <div className="bg-gray-50 rounded-lg p-4 grid grid-cols-2 gap-3 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Warehouse</span><span className="font-medium text-gray-800">{receive.warehouse}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Vendor / Supplier</span><span className="font-medium text-gray-800">{receive.vendor || '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Reference</span><span className="text-gray-700">{receive.reference || '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Received By</span><span className="text-gray-700">{receive.receivedBy}</span></div>
            <div className="flex justify-between col-span-2"><span className="text-gray-500">Date</span><span className="text-gray-700">{receive.createdAt}</span></div>
          </div>

          {/* Items */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Products Received ({receive.totalItems} units)</p>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Product</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">SKU</th>
                    <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {receive.items.map((item, i) => (
                    <tr key={`${item.productId}-${i}`} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0 overflow-hidden">
                            {item.imageUrl ? (
                              <img src={item.imageUrl} alt={item.productName} className="w-full h-full object-cover" />
                            ) : (
                              <i className="ri-box-3-line text-emerald-500 text-xs"></i>
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-gray-800">{item.productName}</p>
                            {item.binLocation && <p className="text-xs text-gray-400 font-mono">Bin: {item.binLocation}</p>}
                            {item.expiryDate && (
                              <p className={`text-[11px] ${expiryTone(item.expiryDate)}`}>Exp {formatExpiry(item.expiryDate)}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{item.sku}</td>
                      <td className="px-3 py-3 text-center font-semibold text-gray-800">{item.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Notes */}
          {receive.notes && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
              <i className="ri-sticky-note-line mr-2"></i>{receive.notes}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer whitespace-nowrap">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
