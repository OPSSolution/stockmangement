import ExcelJS from 'exceljs';

interface RequestFormItem {
  productName: string;
  quantity: number;
  packageWeight?: number | null;
  unit?: string | null;
  totalKg?: number | null;
}

export interface RequestFormData {
  id: string;
  reference: string | null;
  date_of_receive: string | null;
  requested_by: string;
  items: RequestFormItem[];
  needs_return: boolean;
  reason: string | null;
  reason_tags: string[];
  reviewed_by: string | null;
  reviewed_at: string | null;
  reviewed_by_2: string | null;
  reviewed_at_2: string | null;
  approved_by: string | null;
  approved_at: string | null;
}

export interface RequestFormTemplateInfo {
  name: string;
  logo_url: string | null;
}

const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2F1E5' } };
const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFB9C4BB' } },
  left: { style: 'thin', color: { argb: 'FFB9C4BB' } },
  bottom: { style: 'thin', color: { argb: 'FFB9C4BB' } },
  right: { style: 'thin', color: { argb: 'FFB9C4BB' } },
};

function formatDateTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

async function fetchImageBuffer(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

/** Recreates the company's paper request form (logo, itemized table, remark/total, reason, signature blocks) as a downloadable .xlsx — matches the layout staff already fill out by hand. */
export async function exportRequestAsForm(req: RequestFormData, template: RequestFormTemplateInfo | null) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Request', { pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 } });

  sheet.columns = [
    { width: 6 },   // A - No.
    { width: 12 },  // B - Date
    { width: 14 },  // C - Product Name
    { width: 10 },  // D
    { width: 10 },  // E
    { width: 14 },  // F - Package Type
    { width: 8 },   // G - Qty
    { width: 10 },  // H - Total
  ];

  let row = 1;

  // Logo — placed over the top-left rows, text flows to its right.
  if (template?.logo_url) {
    const buffer = await fetchImageBuffer(template.logo_url);
    if (buffer) {
      const ext = template.logo_url.toLowerCase().includes('.png') ? 'png' : 'jpeg';
      const imageId = workbook.addImage({ buffer: buffer as unknown as ExcelJS.Buffer, extension: ext });
      sheet.addImage(imageId, { tl: { col: 0, row: 0 }, ext: { width: 90, height: 90 } });
    }
  }
  row += 5;

  sheet.mergeCells(`A${row}:H${row}`);
  const titleCell = sheet.getCell(`A${row}`);
  titleCell.value = template?.name ? `${template.name} — Requested Form` : 'Requested Form';
  titleCell.font = { bold: true, size: 16 };
  titleCell.alignment = { horizontal: 'center' };
  row += 2;

  sheet.mergeCells(`A${row}:D${row}`);
  sheet.getCell(`A${row}`).value = `Date of Receive: ${req.date_of_receive || ''}`;
  sheet.getCell(`A${row}`).font = { bold: true };
  row += 1;

  sheet.mergeCells(`A${row}:D${row}`);
  sheet.getCell(`A${row}`).value = `Reference: ${req.reference || ''}`;
  sheet.getCell(`A${row}`).font = { bold: true };
  row += 2;

  // Item table header
  const headerRow = row;
  const headers = ['No.', 'Date', 'Product Name', '', '', 'Package Type', 'Qty', 'Total'];
  headers.forEach((h, i) => {
    const cell = sheet.getCell(headerRow, i + 1);
    cell.value = h;
  });
  sheet.mergeCells(`C${headerRow}:E${headerRow}`);
  ['A', 'B', 'C', 'F', 'G', 'H'].forEach((col) => {
    const cell = sheet.getCell(`${col}${headerRow}`);
    cell.font = { bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.fill = HEADER_FILL;
    cell.border = BORDER;
  });
  row += 1;

  const itemDate = formatDateTime(req.date_of_receive) || formatDateTime(new Date().toISOString());
  req.items.forEach((item, idx) => {
    const total = item.totalKg ?? item.quantity;
    sheet.getCell(`A${row}`).value = idx + 1;
    sheet.getCell(`B${row}`).value = itemDate;
    sheet.mergeCells(`C${row}:E${row}`);
    sheet.getCell(`C${row}`).value = item.productName;
    sheet.getCell(`F${row}`).value = item.packageWeight ? `${item.packageWeight}${item.unit || 'kg'}` : (item.unit || '');
    sheet.getCell(`G${row}`).value = item.quantity;
    sheet.getCell(`H${row}`).value = total;
    ['A', 'B', 'C', 'F', 'G', 'H'].forEach((col) => {
      const cell = sheet.getCell(`${col}${row}`);
      cell.border = BORDER;
      cell.alignment = { horizontal: col === 'C' ? 'left' : 'center', vertical: 'middle' };
    });
    row += 1;
  });

  const totalQty = req.items.reduce((s, i) => s + i.quantity, 0);

  // Remark / Return Back + Total
  sheet.mergeCells(`A${row}:B${row}`);
  sheet.getCell(`A${row}`).value = `Remark: ${req.needs_return ? '☑' : '☐'} Return Back`;
  sheet.getCell(`A${row}`).font = { bold: true };
  sheet.getCell(`G${row}`).value = 'Total:';
  sheet.getCell(`G${row}`).font = { bold: true };
  sheet.getCell(`G${row}`).alignment = { horizontal: 'right' };
  sheet.getCell(`H${row}`).value = totalQty;
  sheet.getCell(`H${row}`).font = { bold: true };
  row += 2;

  // Reason
  sheet.mergeCells(`A${row}:H${row}`);
  const reasonCell = sheet.getCell(`A${row}`);
  reasonCell.value = `Reason: ${req.reason || ''}`;
  reasonCell.font = { bold: true, underline: true };
  row += 1;

  if (req.reason_tags.length > 0) {
    sheet.mergeCells(`A${row}:H${row}`);
    sheet.getCell(`A${row}`).value = req.reason_tags.join(', ');
    row += 1;
  }
  row += 1;

  // Signature blocks
  const signers: { label: string; name: string | null; date: string | null }[] = [
    { label: 'Requested by:', name: req.requested_by, date: req.date_of_receive },
    { label: 'Reviewed by:', name: req.reviewed_by, date: formatDateTime(req.reviewed_at) },
    { label: 'Acknowledged by:', name: req.reviewed_by_2, date: formatDateTime(req.reviewed_at_2) },
    { label: 'Approved by:', name: req.approved_by, date: formatDateTime(req.approved_at) },
  ];
  const sigCols = ['A', 'C', 'E', 'G'];
  signers.forEach((s, i) => {
    const col = sigCols[i];
    sheet.mergeCells(`${col}${row}:${col === 'G' ? 'H' : String.fromCharCode(col.charCodeAt(0) + 1)}${row}`);
    sheet.getCell(`${col}${row}`).value = s.label;
    sheet.getCell(`${col}${row}`).font = { bold: true };
  });
  row += 1;
  signers.forEach((s, i) => {
    const col = sigCols[i];
    sheet.mergeCells(`${col}${row}:${col === 'G' ? 'H' : String.fromCharCode(col.charCodeAt(0) + 1)}${row}`);
    sheet.getCell(`${col}${row}`).value = `Name: ${s.name || '.....................'}`;
  });
  row += 1;
  signers.forEach((s, i) => {
    const col = sigCols[i];
    sheet.mergeCells(`${col}${row}:${col === 'G' ? 'H' : String.fromCharCode(col.charCodeAt(0) + 1)}${row}`);
    sheet.getCell(`${col}${row}`).value = `Date: ${s.date || '.....................'}`;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${req.id}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
