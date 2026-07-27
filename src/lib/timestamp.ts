// "YYYY-MM-DD HH:mm" in the browser's local time — the shape several tables'
// created_at/updated_at columns already expect (display code elsewhere splits
// on the space to pull out just the date part). Do NOT build this from
// toISOString(): that clock is UTC, so slicing it produces a string that
// looks like local time but is actually 7-8 hours off for most users.
export function nowStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
