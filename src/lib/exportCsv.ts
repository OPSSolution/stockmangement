export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

function csvEscape(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? '' : String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

/** Builds a CSV from the given rows/columns and triggers a browser download — shared by every page's Export button. */
export function exportToCsv<T>(filename: string, rows: T[], columns: ExportColumn<T>[]) {
  const header = columns.map((c) => csvEscape(c.header)).join(',');
  const lines = rows.map((row) => columns.map((c) => csvEscape(c.value(row))).join(','));
  const csv = [header, ...lines].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
