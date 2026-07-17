import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type RGB = [number, number, number];

const BRAND: RGB = [5, 150, 105]; // emerald-600
const BRAND_SOFT: RGB = [209, 250, 229]; // emerald-100
const TEXT_DARK: RGB = [17, 24, 39]; // gray-900
const TEXT_MID: RGB = [55, 65, 81]; // gray-700
const TEXT_MUTED: RGB = [107, 114, 128]; // gray-500
const TEXT_FAINT: RGB = [156, 163, 175]; // gray-400
const BORDER: RGB = [229, 231, 235]; // gray-200
const BG_SOFT: RGB = [249, 250, 251]; // gray-50
const WHITE: RGB = [255, 255, 255];

const NOTE_TONES: Record<string, { bg: RGB; border: RGB; text: RGB; label: RGB }> = {
  amber: { bg: [255, 251, 235], border: [253, 230, 138], text: [180, 83, 9], label: [180, 83, 9] },
  violet: { bg: [245, 243, 255], border: [221, 214, 254], text: [91, 33, 182], label: [91, 33, 182] },
  red: { bg: [254, 242, 242], border: [254, 202, 202], text: [185, 28, 28], label: [185, 28, 28] },
  gray: { bg: [249, 250, 251], border: [229, 231, 235], text: [55, 65, 81], label: [107, 114, 128] },
};

const STATUS_TONES: Record<string, RGB> = {
  approved: [16, 185, 129],
  accepted: [16, 185, 129],
  restocked: [16, 185, 129],
  completed: [16, 185, 129],
  delivered: [16, 185, 129],
  received: [16, 185, 129],
  fulfilled: [16, 185, 129],
  pending: [217, 119, 6],
  requested: [217, 119, 6],
  in_transit: [2, 132, 199],
  ready: [124, 58, 237],
  inspecting: [217, 119, 6],
  partial: [2, 132, 199],
  returned: [124, 58, 237],
  rejected: [220, 38, 38],
  discarded: [220, 38, 38],
  cancelled: [156, 163, 175],
};

export interface PdfInfoRow {
  label: string;
  value: string;
}

export interface PdfInfoBox {
  title: string;
  rows: PdfInfoRow[];
}

export interface PdfNote {
  label: string;
  text: string;
  tone?: 'amber' | 'violet' | 'red' | 'gray';
}

export type PdfCell = string | number | { content: string | number; colSpan?: number; styles?: { halign?: 'left' | 'center' | 'right' } };

export interface PdfTableSpec {
  title?: string;
  head: string[];
  rows: (string | number)[][];
  colStyles?: Record<number, { halign?: 'left' | 'center' | 'right'; cellWidth?: number }>;
  footRow?: PdfCell[];
}

export interface PdfTimelineEntry {
  title: string;
  text?: string;
  meta?: string;
}

export interface PdfDoc {
  /** e.g. "Purchase Order", "Delivery Note", "Stock Transfer", "Stock Request", "Return" */
  docType: string;
  docId: string;
  status?: string;
  subtitle?: string;
  infoBoxes?: PdfInfoBox[];
  notes?: PdfNote[];
  tables?: PdfTableSpec[];
  timeline?: PdfTimelineEntry[];
  footerLeft?: string;
}

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;

function setFill(doc: jsPDF, c: RGB) { doc.setFillColor(c[0], c[1], c[2]); }
function setDraw(doc: jsPDF, c: RGB) { doc.setDrawColor(c[0], c[1], c[2]); }
function setText(doc: jsPDF, c: RGB) { doc.setTextColor(c[0], c[1], c[2]); }

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > PAGE_H - MARGIN - 24) {
    doc.addPage();
    return MARGIN;
  }
  return y;
}

function statusColor(status?: string): RGB {
  if (!status) return TEXT_MUTED;
  return STATUS_TONES[status.toLowerCase()] || TEXT_MUTED;
}

/** jsPDF's built-in fonts only cover WinAnsi/Latin-1 — anything outside that (the
 * "→" separator, the Khmer Riel sign "៛", smart quotes, CJK/Khmer script, emoji…)
 * silently corrupts glyph spacing instead of erroring, so every string that reaches
 * doc.text/autoTable has to be normalized first. */
function sanitizeText(input: string): string {
  return input
    .replace(/→/g, '->')
    .replace(/←/g, '<-')
    .replace(/៛/g, 'KHR ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .split('')
    .map((ch) => (ch.charCodeAt(0) > 255 ? '?' : ch))
    .join('');
}

function sanitizeCell<T extends PdfCell>(cell: T): T {
  if (typeof cell === 'string') return sanitizeText(cell) as T;
  if (typeof cell === 'object' && cell !== null && 'content' in cell) {
    return { ...cell, content: typeof cell.content === 'string' ? sanitizeText(cell.content) : cell.content } as T;
  }
  return cell;
}

function sanitizeSpec(spec: PdfDoc): PdfDoc {
  return {
    ...spec,
    docType: sanitizeText(spec.docType),
    docId: sanitizeText(spec.docId),
    status: spec.status ? sanitizeText(spec.status) : spec.status,
    subtitle: spec.subtitle ? sanitizeText(spec.subtitle) : spec.subtitle,
    infoBoxes: spec.infoBoxes?.map((box) => ({
      title: sanitizeText(box.title),
      rows: box.rows.map((row) => ({ label: sanitizeText(row.label), value: sanitizeText(row.value) })),
    })),
    notes: spec.notes?.map((note) => ({ ...note, label: sanitizeText(note.label), text: sanitizeText(note.text) })),
    tables: spec.tables?.map((table) => ({
      ...table,
      title: table.title ? sanitizeText(table.title) : table.title,
      head: table.head.map(sanitizeText),
      rows: table.rows.map((row) => row.map((cell) => (typeof cell === 'string' ? sanitizeText(cell) : cell))),
      footRow: table.footRow?.map(sanitizeCell),
    })),
    timeline: spec.timeline?.map((entry) => ({
      title: sanitizeText(entry.title),
      text: entry.text ? sanitizeText(entry.text) : entry.text,
      meta: entry.meta ? sanitizeText(entry.meta) : entry.meta,
    })),
    footerLeft: spec.footerLeft ? sanitizeText(spec.footerLeft) : spec.footerLeft,
  };
}

function drawHeader(doc: jsPDF, spec: PdfDoc): number {
  setFill(doc, BRAND);
  doc.rect(0, 0, PAGE_W, 6, 'F');

  let y = MARGIN;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  setText(doc, BRAND);
  doc.text('StockManagement', MARGIN, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setText(doc, TEXT_FAINT);
  const generated = `Generated ${new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
  doc.text(generated, PAGE_W - MARGIN, y, { align: 'right' });

  y += 22;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  setText(doc, TEXT_DARK);
  doc.text(spec.docType, MARGIN, y);

  if (spec.status) {
    const tone = statusColor(spec.status);
    const label = spec.status.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    const textW = doc.getTextWidth(label);
    const pillW = textW + 18;
    const pillH = 18;
    const pillX = PAGE_W - MARGIN - pillW;
    const pillY = y - pillH + 5;
    setFill(doc, [tone[0], tone[1], tone[2]]);
    doc.setGState(new (doc as unknown as { GState: new (o: object) => unknown }).GState({ opacity: 0.12 }) as never);
    doc.roundedRect(pillX, pillY, pillW, pillH, 9, 9, 'F');
    doc.setGState(new (doc as unknown as { GState: new (o: object) => unknown }).GState({ opacity: 1 }) as never);
    setText(doc, tone);
    doc.text(label, pillX + pillW / 2, pillY + pillH / 2 + 3, { align: 'center' });
  }

  y += 16;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  setText(doc, TEXT_MUTED);
  doc.text(spec.docId, MARGIN, y);

  if (spec.subtitle) {
    y += 15;
    doc.setFontSize(10);
    setText(doc, TEXT_MID);
    const lines = doc.splitTextToSize(spec.subtitle, CONTENT_W) as string[];
    doc.text(lines, MARGIN, y);
    y += (lines.length - 1) * 13;
  }

  y += 14;
  setDraw(doc, BORDER);
  doc.setLineWidth(0.75);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);

  return y + 22;
}

interface MeasuredInfoRow {
  row: PdfInfoRow;
  lines: string[];
}

/** Wraps each value to the space actually left over after its label, so a long
 * address or name can't overflow past the box's left edge into whatever sits there. */
function measureInfoRows(doc: jsPDF, box: PdfInfoBox, boxW: number): { rows: MeasuredInfoRow[]; height: number } {
  const availW = boxW - 24;
  const rows = box.rows.map((row) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    const labelW = doc.getTextWidth(row.label);
    const valueMaxW = Math.max(50, availW - labelW - 10);
    doc.setFont('helvetica', 'bold');
    const lines = doc.splitTextToSize(row.value || '—', valueMaxW) as string[];
    return { row, lines };
  });
  const height = rows.reduce((s, r) => s + Math.max(1, r.lines.length) * 12 + 4, 0);
  return { rows, height };
}

function drawInfoBoxes(doc: jsPDF, boxes: PdfInfoBox[], startY: number): number {
  let y = startY;
  const gap = 12;
  const boxW = (CONTENT_W - gap) / 2;

  for (let i = 0; i < boxes.length; i += 2) {
    const pair = boxes.slice(i, i + 2);
    const measured = pair.map((box) => measureInfoRows(doc, box, boxW));
    const contentH = Math.max(...measured.map((m) => m.height));
    const boxH = 30 + contentH;
    y = ensureSpace(doc, y, boxH + 10);

    pair.forEach((box, idx) => {
      const x = MARGIN + idx * (boxW + gap);
      setFill(doc, BG_SOFT);
      setDraw(doc, BORDER);
      doc.roundedRect(x, y, boxW, boxH, 6, 6, 'FD');

      let ry = y + 16;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      setText(doc, TEXT_FAINT);
      doc.text(box.title.toUpperCase(), x + 12, ry);
      ry += 15;

      measured[idx].rows.forEach(({ row, lines }) => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        setText(doc, TEXT_MUTED);
        doc.text(row.label, x + 12, ry);

        doc.setFont('helvetica', 'bold');
        setText(doc, TEXT_DARK);
        lines.forEach((line, li) => {
          doc.text(line, x + boxW - 12, ry + li * 12, { align: 'right' });
        });
        ry += Math.max(1, lines.length) * 12 + 4;
      });
    });

    y += boxH + gap;
  }

  return y;
}

function drawNotes(doc: jsPDF, notes: PdfNote[], startY: number): number {
  let y = startY;
  notes.forEach((note) => {
    const tone = NOTE_TONES[note.tone || 'gray'];
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    const lines = doc.splitTextToSize(note.text, CONTENT_W - 24);
    const boxH = 22 + lines.length * 13;
    y = ensureSpace(doc, y, boxH + 10);

    setFill(doc, tone.bg);
    setDraw(doc, tone.border);
    doc.roundedRect(MARGIN, y, CONTENT_W, boxH, 6, 6, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    setText(doc, tone.label);
    doc.text(note.label.toUpperCase(), MARGIN + 12, y + 15);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    setText(doc, tone.text);
    doc.text(lines, MARGIN + 12, y + 29);

    y += boxH + 12;
  });
  return y;
}

function drawTable(doc: jsPDF, table: PdfTableSpec, startY: number): number {
  let y = startY;
  if (table.title) {
    y = ensureSpace(doc, y, 20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    setText(doc, TEXT_DARK);
    doc.text(table.title, MARGIN, y);
    y += 10;
  }

  const columnStyles: Record<number, { halign?: 'left' | 'center' | 'right'; cellWidth?: number }> = table.colStyles || {};

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [table.head],
    body: table.rows,
    foot: table.footRow ? [table.footRow] : undefined,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      textColor: TEXT_MID,
      lineColor: BORDER,
      lineWidth: 0.5,
      cellPadding: 6,
    },
    headStyles: {
      fillColor: BRAND_SOFT,
      textColor: [4, 120, 87],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    footStyles: {
      fillColor: BG_SOFT,
      textColor: TEXT_DARK,
      fontStyle: 'bold',
      fontSize: 9,
    },
    alternateRowStyles: { fillColor: [252, 253, 253] },
    columnStyles,
  });

  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20;
}

function drawTimeline(doc: jsPDF, entries: PdfTimelineEntry[], startY: number): number {
  let y = startY;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  setText(doc, TEXT_DARK);
  y = ensureSpace(doc, y, 20);
  doc.text('Activity Timeline', MARGIN, y);
  y += 16;

  entries.forEach((entry, i) => {
    const lines = entry.text ? doc.splitTextToSize(entry.text, CONTENT_W - 24) : [];
    const blockH = 14 + lines.length * 12 + (entry.meta ? 12 : 0) + 6;
    y = ensureSpace(doc, y, blockH);

    setFill(doc, i === entries.length - 1 ? BRAND : TEXT_FAINT);
    doc.circle(MARGIN + 3, y - 3, 3, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    setText(doc, TEXT_DARK);
    doc.text(entry.title, MARGIN + 14, y);
    y += 13;

    if (entry.text) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      setText(doc, TEXT_MID);
      doc.text(lines, MARGIN + 14, y);
      y += lines.length * 12;
    }

    if (entry.meta) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      setText(doc, TEXT_FAINT);
      doc.text(entry.meta, MARGIN + 14, y);
      y += 12;
    }

    y += 8;
  });

  return y;
}

function drawFooters(doc: jsPDF, footerLeft?: string) {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    setDraw(doc, BORDER);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, PAGE_H - MARGIN, PAGE_W - MARGIN, PAGE_H - MARGIN);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setText(doc, TEXT_FAINT);
    if (footerLeft) doc.text(footerLeft, MARGIN, PAGE_H - MARGIN + 14);
    doc.text(`Page ${i} of ${pageCount}`, PAGE_W - MARGIN, PAGE_H - MARGIN + 14, { align: 'right' });
  }
}

export function buildPdf(rawSpec: PdfDoc): jsPDF {
  const spec = sanitizeSpec(rawSpec);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  let y = drawHeader(doc, spec);

  if (spec.infoBoxes && spec.infoBoxes.length > 0) {
    y = drawInfoBoxes(doc, spec.infoBoxes, y);
  }

  if (spec.notes && spec.notes.length > 0) {
    y = drawNotes(doc, spec.notes, y);
  }

  (spec.tables || []).forEach((table) => {
    y = drawTable(doc, table, y);
  });

  if (spec.timeline && spec.timeline.length > 0) {
    y = drawTimeline(doc, spec.timeline, y);
  }

  drawFooters(doc, spec.footerLeft);
  return doc;
}

export function downloadPdf(spec: PdfDoc, filename: string) {
  const doc = buildPdf(spec);
  doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}
