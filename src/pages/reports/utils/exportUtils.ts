import type { ReportSummary } from '../page';

// ─── CSV helpers ────────────────────────────────────────────────────────────

function toCsvRow(values: (string | number)[]): string {
  return values.map((v) => {
    const str = String(v);
    return str.includes(',') || str.includes('"') || str.includes('\n')
      ? `"${str.replace(/"/g, '""')}"`
      : str;
  }).join(',');
}

function downloadCsv(filename: string, rows: string[]): void {
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Stored monetary values are USD (the KHR toggle only converts for display —
// see src/lib/currency.ts) — CSVs export the raw stored figure, so they're
// labeled by their real unit rather than whatever the viewer's toggle shows.

// ─── CSV exports ─────────────────────────────────────────────────────────────

export function exportRevenueCsv(summary: ReportSummary): void {
  const header = toCsvRow(['Month', 'Revenue (USD)', 'Orders', 'Returns']);
  const dataRows = summary.revenueMonthly.map((m) => toCsvRow([m.date, m.revenue.toFixed(2), m.orders, m.returns]));
  const ytdRevenue = summary.revenueMonthly.reduce((s, m) => s + m.revenue, 0);
  const ytdOrders = summary.revenueMonthly.reduce((s, m) => s + m.orders, 0);
  const ytdReturns = summary.revenueMonthly.reduce((s, m) => s + m.returns, 0);
  const totalsRow = toCsvRow(['YTD Total', ytdRevenue.toFixed(2), ytdOrders, ytdReturns]);
  downloadCsv('StockManagement_Revenue_By_Month.csv', [header, ...dataRows, totalsRow]);
}

export function exportTopProductsCsv(summary: ReportSummary): void {
  const header = toCsvRow(['Rank', 'Product Name', 'SKU', 'Category', 'Units Sold', 'Revenue (USD)', 'On Hold Rate (%)', 'Trend']);
  const dataRows = summary.topProducts.map((p, i) =>
    toCsvRow([i + 1, p.productName, p.sku, p.category, p.unitsSold, p.revenue.toFixed(2), p.onHoldRate, p.trend])
  );
  downloadCsv('StockManagement_Top_Products.csv', [header, ...dataRows]);
}

export function exportCategoryBreakdownCsv(summary: ReportSummary): void {
  const header = toCsvRow(['Category', 'Revenue (USD)', 'Units Sold', 'On Hold Units', 'On Hold Rate (%)']);
  const dataRows = summary.categoryBreakdown.map((c) =>
    toCsvRow([c.category, c.revenue.toFixed(2), c.unitsSold, c.onHoldUnits, c.onHoldRate])
  );
  downloadCsv('StockManagement_Category_Breakdown.csv', [header, ...dataRows]);
}

export function exportReturnReasonsCsv(summary: ReportSummary): void {
  const header = toCsvRow(['Return Reason', 'Count', 'Value (USD)', 'Percentage (%)']);
  const dataRows = summary.returnReasons.map((r) =>
    toCsvRow([r.reason, r.count, r.value.toFixed(2), r.percentage])
  );
  downloadCsv('StockManagement_Return_Reasons.csv', [header, ...dataRows]);
}

export function exportWarehousePerformanceCsv(summary: ReportSummary): void {
  const header = toCsvRow(['Warehouse', 'Inbound Units', 'Outbound Units', 'Returns', 'Fulfillment Rate (%)', 'Avg Processing Days']);
  const dataRows = summary.warehousePerformance.map((w) =>
    toCsvRow([w.warehouse, w.inbound, w.outbound, w.returns, w.fulfillmentRate, w.avgProcessingDays])
  );
  downloadCsv('StockManagement_Warehouse_Performance.csv', [header, ...dataRows]);
}

export function exportVendorPerformanceCsv(summary: ReportSummary): void {
  const header = toCsvRow(['Vendor', 'Fulfillment Rate (%)', 'Total Orders', 'Rejected', 'Avg Delivery Days', 'Revenue (USD)']);
  const dataRows = summary.vendorPerformance.map((v) =>
    toCsvRow([v.vendor, v.fulfillmentRate, v.totalOrders, v.rejectedOrders, v.avgDeliveryDays, v.revenue.toFixed(2)])
  );
  downloadCsv('StockManagement_Vendor_Performance.csv', [header, ...dataRows]);
}

export function exportAllReportsCsv(summary: ReportSummary, periodLabel: string): void {
  const sections: string[] = [];

  sections.push('STOCKMANAGEMENT — FULL REPORTS EXPORT');
  sections.push(`Period: ${periodLabel}`);
  sections.push(`Generated: ${new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric' })}`);
  sections.push('');

  sections.push('=== REVENUE BY MONTH (YTD) ===');
  sections.push(toCsvRow(['Month', 'Revenue (USD)', 'Orders', 'Returns']));
  summary.revenueMonthly.forEach((m) => sections.push(toCsvRow([m.date, m.revenue.toFixed(2), m.orders, m.returns])));
  sections.push('');

  sections.push('=== TOP PRODUCTS ===');
  sections.push(toCsvRow(['Rank', 'Product Name', 'SKU', 'Category', 'Units Sold', 'Revenue (USD)', 'Return Rate (%)', 'Trend']));
  summary.topProducts.forEach((p, i) =>
    sections.push(toCsvRow([i + 1, p.productName, p.sku, p.category, p.unitsSold, p.revenue.toFixed(2), p.returnRate, p.trend]))
  );
  sections.push('');

  sections.push('=== CATEGORY BREAKDOWN ===');
  sections.push(toCsvRow(['Category', 'Revenue (USD)', 'Units Sold', 'Return Count', 'Return Rate (%)']));
  summary.categoryBreakdown.forEach((c) =>
    sections.push(toCsvRow([c.category, c.revenue.toFixed(2), c.unitsSold, c.returnCount, c.returnRate]))
  );
  sections.push('');

  sections.push('=== RETURN REASONS ===');
  sections.push(toCsvRow(['Return Reason', 'Count', 'Value (USD)', 'Percentage (%)']));
  summary.returnReasons.forEach((r) =>
    sections.push(toCsvRow([r.reason, r.count, r.value.toFixed(2), r.percentage]))
  );
  sections.push('');

  sections.push('=== WAREHOUSE PERFORMANCE ===');
  sections.push(toCsvRow(['Warehouse', 'Inbound', 'Outbound', 'Returns', 'Fulfillment Rate (%)', 'Avg Processing Days']));
  summary.warehousePerformance.forEach((w) =>
    sections.push(toCsvRow([w.warehouse, w.inbound, w.outbound, w.returns, w.fulfillmentRate, w.avgProcessingDays]))
  );
  sections.push('');

  sections.push('=== VENDOR PERFORMANCE ===');
  sections.push(toCsvRow(['Vendor', 'Fulfillment Rate (%)', 'Total Orders', 'Rejected', 'Avg Delivery Days', 'Revenue (USD)']));
  summary.vendorPerformance.forEach((v) =>
    sections.push(toCsvRow([v.vendor, v.fulfillmentRate, v.totalOrders, v.rejectedOrders, v.avgDeliveryDays, v.revenue.toFixed(2)]))
  );

  downloadCsv('StockManagement_Full_Report.csv', sections);
}

// ─── PDF export (browser print + styled HTML) ────────────────────────────────

export function exportReportsPdf(summary: ReportSummary, periodLabel: string, formatAmount: (n: number) => string): void {
  const generatedDate = new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric' });
  const monthly = summary.revenueMonthly;
  const latest = monthly[monthly.length - 1];
  const previous = monthly[monthly.length - 2];
  const revGrowth = latest && previous && previous.revenue > 0 ? (((latest.revenue - previous.revenue) / previous.revenue) * 100).toFixed(1) : null;
  const ytdRevenue = monthly.reduce((s, m) => s + m.revenue, 0);
  const ytdOrders = monthly.reduce((s, m) => s + m.orders, 0);
  const ytdReturns = monthly.reduce((s, m) => s + m.returns, 0);
  const decidedReturns = (summary.current.returns.statusBreakdown?.restocked || 0) + (summary.current.returns.statusBreakdown?.discarded || 0);
  const restockRate = decidedReturns > 0 ? (((summary.current.returns.statusBreakdown?.restocked || 0) / decidedReturns) * 100).toFixed(1) : null;
  const topProduct = summary.topProducts[0];

  const monthlyRows = monthly.map((m, i) => {
    const prev = monthly[i - 1];
    const growth = prev && prev.revenue > 0 ? (((m.revenue - prev.revenue) / prev.revenue) * 100).toFixed(1) : null;
    const growthHtml = growth
      ? `<span style="font-size:11px;color:${Number(growth) >= 0 ? '#10b981' : '#ef4444'};margin-left:6px">${Number(growth) >= 0 ? '+' : ''}${growth}%</span>`
      : '';
    return `<tr>
      <td>${m.date}${i === monthly.length - 1 ? ' <span style="color:#10b981;font-size:11px">(current)</span>' : ''}</td>
      <td style="text-align:right;font-weight:600">${formatAmount(m.revenue)}${growthHtml}</td>
      <td style="text-align:right">${m.orders}</td>
      <td style="text-align:right;color:#f59e0b">${m.returns}</td>
    </tr>`;
  }).join('');

  const productRows = summary.topProducts.map((p, i) => {
    const returnColor = p.returnRate > 5 ? '#ef4444' : p.returnRate > 2.5 ? '#f59e0b' : '#10b981';
    const trendColor = p.trend === 'up' ? '#10b981' : p.trend === 'down' ? '#ef4444' : '#9ca3af';
    const trendLabel = p.trend === 'up' ? '▲ Rising' : p.trend === 'down' ? '▼ Falling' : '→ Stable';
    return `<tr>
      <td style="text-align:center;color:#9ca3af">#${i + 1}</td>
      <td><strong>${p.productName}</strong><br><span style="color:#9ca3af;font-size:11px">${p.sku} · ${p.category}</span></td>
      <td style="text-align:right">${p.unitsSold}</td>
      <td style="text-align:right;font-weight:600">${formatAmount(p.revenue)}</td>
      <td style="text-align:right;color:${returnColor};font-weight:600">${p.returnRate}%</td>
      <td style="text-align:center;color:${trendColor};font-size:11px">${trendLabel}</td>
    </tr>`;
  }).join('');

  const warehouseRows = summary.warehousePerformance.map((w) => {
    const rateColor = w.fulfillmentRate >= 92 ? '#10b981' : w.fulfillmentRate >= 85 ? '#f59e0b' : '#ef4444';
    return `<tr>
      <td><strong>${w.warehouse}</strong></td>
      <td style="text-align:right">${w.inbound.toLocaleString()}</td>
      <td style="text-align:right">${w.outbound.toLocaleString()}</td>
      <td style="text-align:right">${w.returns}</td>
      <td style="text-align:right;color:${rateColor};font-weight:600">${w.fulfillmentRate}%</td>
      <td style="text-align:right">${w.avgProcessingDays} days</td>
    </tr>`;
  }).join('');

  const vendorRows = summary.vendorPerformance.map((v, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
    const rateColor = v.fulfillmentRate >= 95 ? '#10b981' : v.fulfillmentRate >= 85 ? '#f59e0b' : '#ef4444';
    return `<tr>
      <td style="text-align:center">${medal}</td>
      <td><strong>${v.vendor}</strong></td>
      <td style="text-align:right;color:${rateColor};font-weight:600">${v.fulfillmentRate}%</td>
      <td style="text-align:right">${v.totalOrders}</td>
      <td style="text-align:right;color:${v.rejectedOrders > 0 ? '#ef4444' : '#10b981'}">${v.rejectedOrders}</td>
      <td style="text-align:right">${v.avgDeliveryDays} days</td>
      <td style="text-align:right;font-weight:600">${formatAmount(v.revenue)}</td>
    </tr>`;
  }).join('');

  const returnRows = summary.returnReasons.map((r) => `<tr>
    <td>${r.reason}</td>
    <td style="text-align:right">${r.count}</td>
    <td style="text-align:right">${formatAmount(r.value)}</td>
    <td style="text-align:right">${r.percentage}%</td>
  </tr>`).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>StockManagement Reports — ${generatedDate}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; color: #111827; background: #fff; }
  .page { padding: 32px 40px; max-width: 960px; margin: 0 auto; }
  .header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 20px; border-bottom: 2px solid #10b981; margin-bottom: 28px; }
  .brand { display: flex; align-items: center; gap: 12px; }
  .brand-icon { width: 36px; height: 36px; background: #10b981; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-size: 18px; }
  .brand-name { font-size: 20px; font-weight: 700; color: #111827; }
  .brand-sub { font-size: 12px; color: #9ca3af; }
  .meta { text-align: right; color: #6b7280; font-size: 12px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px; }
  .kpi-card { background: #f9fafb; border-radius: 10px; padding: 16px; }
  .kpi-label { font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
  .kpi-value { font-size: 20px; font-weight: 700; color: #111827; }
  .kpi-sub { font-size: 11px; margin-top: 4px; }
  .section { margin-bottom: 32px; }
  .section-title { font-size: 14px; font-weight: 700; color: #111827; border-left: 3px solid #10b981; padding-left: 10px; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; padding: 8px 10px; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid #e5e7eb; background: #f9fafb; }
  td { padding: 8px 10px; border-bottom: 1px solid #f3f4f6; }
  tr:last-child td { border-bottom: none; }
  .tfoot-row td { font-weight: 700; background: #f0fdf4; border-top: 2px solid #d1fae5; }
  .footer { text-align: center; color: #9ca3af; font-size: 11px; margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="page">
  <!-- Header -->
  <div class="header">
    <div class="brand">
      <div class="brand-icon">&#9632;</div>
      <div>
        <div class="brand-name">StockManagement</div>
        <div class="brand-sub">Admin Panel — Reports &amp; Analytics</div>
      </div>
    </div>
    <div class="meta">
      <div style="font-weight:600;color:#111827;font-size:14px">Full Report</div>
      <div>Generated: ${generatedDate}</div>
      <div>Period: ${periodLabel}</div>
    </div>
  </div>

  <!-- KPI Strip -->
  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-label">This Month Revenue</div>
      <div class="kpi-value" style="color:#10b981">${latest ? formatAmount(latest.revenue) : '—'}</div>
      <div class="kpi-sub" style="color:${revGrowth === null ? '#6b7280' : Number(revGrowth) >= 0 ? '#10b981' : '#ef4444'}">${revGrowth === null ? 'No prior month data' : `${Number(revGrowth) >= 0 ? '+' : ''}${revGrowth}% vs last month`}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">YTD Revenue</div>
      <div class="kpi-value">${formatAmount(ytdRevenue)}</div>
      <div class="kpi-sub" style="color:#6b7280">${ytdOrders} total orders</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Restock Rate</div>
      <div class="kpi-value" style="color:#f59e0b">${restockRate === null ? '—' : `${restockRate}%`}</div>
      <div class="kpi-sub" style="color:#6b7280">${ytdReturns} returns YTD</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Top Product</div>
      <div class="kpi-value" style="font-size:15px">${topProduct ? topProduct.productName.substring(0, 18) + (topProduct.productName.length > 18 ? '…' : '') : '—'}</div>
      <div class="kpi-sub" style="color:#6b7280">${topProduct ? `${topProduct.unitsSold} units · ${formatAmount(topProduct.revenue)}` : 'No sales this period'}</div>
    </div>
  </div>

  <!-- Revenue by Month -->
  <div class="section">
    <div class="section-title">Revenue by Month (YTD)</div>
    <table>
      <thead><tr>
        <th>Month</th><th style="text-align:right">Revenue</th><th style="text-align:right">Orders</th>
        <th style="text-align:right">Returns</th>
      </tr></thead>
      <tbody>${monthlyRows || '<tr><td colspan="4" style="text-align:center;color:#9ca3af">No data</td></tr>'}</tbody>
      <tfoot><tr class="tfoot-row">
        <td>YTD Total</td>
        <td style="text-align:right;color:#10b981">${formatAmount(ytdRevenue)}</td>
        <td style="text-align:right">${ytdOrders}</td>
        <td style="text-align:right;color:#f59e0b">${ytdReturns}</td>
      </tr></tfoot>
    </table>
  </div>

  <!-- Top Products -->
  <div class="section">
    <div class="section-title">Top Products by Revenue</div>
    <table>
      <thead><tr>
        <th style="text-align:center">#</th><th>Product</th><th style="text-align:right">Units Sold</th>
        <th style="text-align:right">Revenue</th><th style="text-align:right">Return Rate</th><th style="text-align:center">Trend</th>
      </tr></thead>
      <tbody>${productRows || '<tr><td colspan="6" style="text-align:center;color:#9ca3af">No product sales this period</td></tr>'}</tbody>
    </table>
  </div>

  <!-- Warehouse Performance -->
  <div class="section">
    <div class="section-title">Warehouse Performance</div>
    <table>
      <thead><tr>
        <th>Warehouse</th><th style="text-align:right">Inbound</th><th style="text-align:right">Outbound</th>
        <th style="text-align:right">Returns</th><th style="text-align:right">Fulfillment</th><th style="text-align:right">Avg Processing</th>
      </tr></thead>
      <tbody>${warehouseRows || '<tr><td colspan="6" style="text-align:center;color:#9ca3af">No warehouses in scope</td></tr>'}</tbody>
    </table>
  </div>

  <!-- Vendor Performance -->
  <div class="section">
    <div class="section-title">Vendor Performance Rankings</div>
    <table>
      <thead><tr>
        <th style="text-align:center">Rank</th><th>Vendor</th><th style="text-align:right">Fulfillment</th>
        <th style="text-align:right">Total Orders</th><th style="text-align:right">Rejected</th>
        <th style="text-align:right">Avg Delivery</th><th style="text-align:right">Revenue</th>
      </tr></thead>
      <tbody>${vendorRows || '<tr><td colspan="7" style="text-align:center;color:#9ca3af">No purchases this period</td></tr>'}</tbody>
    </table>
  </div>

  <!-- Return Reasons -->
  <div class="section">
    <div class="section-title">Return Reasons Breakdown</div>
    <table>
      <thead><tr>
        <th>Reason</th><th style="text-align:right">Count</th>
        <th style="text-align:right">Value</th><th style="text-align:right">% of Returns</th>
      </tr></thead>
      <tbody>${returnRows || '<tr><td colspan="4" style="text-align:center;color:#9ca3af">No returns this period</td></tr>'}</tbody>
    </table>
  </div>

  <div class="footer">StockManagement Admin Panel &nbsp;|&nbsp; Confidential &nbsp;|&nbsp; Generated ${generatedDate}</div>
</div>
</body>
</html>`;

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 500);
}
