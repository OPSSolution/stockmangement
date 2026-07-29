/** Expired → red, within 30 days → amber, otherwise → gray. */
export function expiryTone(expiryDate: string): string {
  const daysLeft = (new Date(expiryDate).getTime() - Date.now()) / 86400000;
  if (daysLeft < 0) return 'text-red-600';
  if (daysLeft <= 30) return 'text-amber-600';
  return 'text-gray-400';
}

export function formatExpiry(expiryDate: string | null | undefined): string {
  if (!expiryDate) return '';
  return new Date(expiryDate).toLocaleDateString();
}

/** " — Exp 7/1/2026" suffix for dropdown option labels, or "" when there's no expiry to show. */
export function expirySuffix(expiryDate: string | null | undefined): string {
  return expiryDate ? ` — Exp ${formatExpiry(expiryDate)}` : '';
}

/** Earliest of a set of expiry dates (e.g. a product's bins) — undefined if none are set.
 * Plain string comparison works because dates are always yyyy-mm-dd (ISO, from <input type="date">). */
export function nearestExpiry(dates: (string | null | undefined)[]): string | undefined {
  const valid = dates.filter((d): d is string => Boolean(d));
  if (valid.length === 0) return undefined;
  return valid.reduce((min, d) => (d < min ? d : min));
}
