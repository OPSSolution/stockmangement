import { useState, useRef, useEffect } from 'react';
import {
  exportAllReportsCsv,
  exportMonthlySnapshotCsv,
  exportTopProductsCsv,
  exportCategoryBreakdownCsv,
  exportReturnReasonsCsv,
  exportWarehousePerformanceCsv,
  exportVendorPerformanceCsv,
  exportReportsPdf,
} from '../utils/exportUtils';

interface ExportOption {
  label: string;
  sublabel: string;
  icon: string;
  action: () => void;
  divider?: boolean;
}

export default function ExportMenu() {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleExport = async (id: string, action: () => void) => {
    setExporting(id);
    setOpen(false);
    await new Promise((r) => setTimeout(r, 300));
    action();
    setExporting(null);
    setSuccess(id);
    setTimeout(() => setSuccess(null), 2500);
  };

  const csvOptions: ExportOption[] = [
    {
      label: 'Full Report (All Sections)',
      sublabel: 'Monthly + Products + Warehouses + Vendors',
      icon: 'ri-file-text-line',
      action: exportAllReportsCsv,
    },
    {
      label: 'Monthly Snapshot',
      sublabel: 'Revenue, orders, returns by month',
      icon: 'ri-calendar-line',
      action: exportMonthlySnapshotCsv,
      divider: true,
    },
    {
      label: 'Top Products',
      sublabel: 'Rankings, revenue, return rates',
      icon: 'ri-trophy-line',
      action: exportTopProductsCsv,
    },
    {
      label: 'Category Breakdown',
      sublabel: 'Revenue split by product category',
      icon: 'ri-pie-chart-line',
      action: exportCategoryBreakdownCsv,
    },
    {
      label: 'Return Reasons',
      sublabel: 'Count, value and % per reason',
      icon: 'ri-arrow-go-back-line',
      action: exportReturnReasonsCsv,
    },
    {
      label: 'Warehouse Performance',
      sublabel: 'Inbound/outbound/fulfillment stats',
      icon: 'ri-building-2-line',
      action: exportWarehousePerformanceCsv,
    },
    {
      label: 'Vendor Performance',
      sublabel: 'Rankings, delivery speed, revenue',
      icon: 'ri-store-2-line',
      action: exportVendorPerformanceCsv,
    },
  ];

  return (
    <div className="relative" ref={ref}>
      {/* Main export button group */}
      <div className="flex items-center gap-2">
        {/* PDF button */}
        <button
          onClick={() => handleExport('pdf', exportReportsPdf)}
          disabled={exporting === 'pdf'}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
        >
          {exporting === 'pdf' ? (
            <i className="ri-loader-4-line animate-spin text-base"></i>
          ) : success === 'pdf' ? (
            <i className="ri-check-line text-base text-emerald-400"></i>
          ) : (
            <i className="ri-file-pdf-line text-base"></i>
          )}
          {exporting === 'pdf' ? 'Generating…' : success === 'pdf' ? 'PDF Ready!' : 'Export PDF'}
        </button>

        {/* CSV dropdown button */}
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors cursor-pointer whitespace-nowrap"
        >
          <i className="ri-file-excel-line text-base"></i>
          Export CSV
          <i className={`ri-arrow-down-s-line text-base transition-transform duration-200 ${open ? 'rotate-180' : ''}`}></i>
        </button>
      </div>

      {/* CSV Dropdown */}
      {open && (
        <div className="absolute right-0 top-11 w-80 bg-white border border-gray-100 rounded-2xl shadow-sm z-50 py-1.5 overflow-hidden"
          style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
          <div className="px-4 py-2.5 border-b border-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Download as CSV</p>
          </div>
          {csvOptions.map((opt, i) => (
            <div key={i}>
              {opt.divider && <div className="border-t border-gray-50 my-1"></div>}
              <button
                onClick={() => handleExport(`csv-${i}`, opt.action)}
                disabled={exporting === `csv-${i}`}
                className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors cursor-pointer text-left disabled:opacity-60"
              >
                <div className="w-8 h-8 flex items-center justify-center bg-emerald-50 rounded-lg flex-shrink-0 mt-0.5">
                  {exporting === `csv-${i}` ? (
                    <i className="ri-loader-4-line animate-spin text-emerald-600 text-sm"></i>
                  ) : success === `csv-${i}` ? (
                    <i className="ri-check-line text-emerald-600 text-sm"></i>
                  ) : (
                    <i className={`${opt.icon} text-emerald-600 text-sm`}></i>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    {success === `csv-${i}` ? 'Downloaded!' : opt.label}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{opt.sublabel}</p>
                </div>
              </button>
            </div>
          ))}
          <div className="px-4 py-2 border-t border-gray-50 mt-1">
            <p className="text-xs text-gray-400">Files open in Excel, Google Sheets, or any spreadsheet app</p>
          </div>
        </div>
      )}
    </div>
  );
}