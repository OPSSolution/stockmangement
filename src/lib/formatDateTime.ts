// Timestamps in the app come from two sources that don't agree on format:
// app-side writes store "YYYY-MM-DD HH:mm" (local, no timezone marker), while
// rows touched directly in the database carry full ISO strings like
// "2026-07-24T09:00:43.928Z". Normalize both to the same display format.
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
